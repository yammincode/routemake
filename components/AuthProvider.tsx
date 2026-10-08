"use client";

import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authErrorMessage, usernameToEmail, type Access } from "@/lib/auth";
import { herePath } from "@/lib/nav";
import { clearCache } from "@/lib/offline";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { markOpen } from "@/lib/usage";

// 要先去取暱稱：還沒填，或暱稱跟登入帳號一樣（暱稱會公開，帳號不該公開）
export const nicknameIsUsername = (a: Access) => !!a.nickname && !!a.username && a.nickname.trim().toLowerCase() === a.username.toLowerCase();
const needsNickname = (a: Access) => !a.nickname || nicknameIsUsername(a);

type AuthState = {
  ready: boolean; // 已經讀完手機裡的登入狀態
  session: Session | null;
  access: Access | null; // 自己的帳號、暱稱、員工角色
  signIn: (username: string, password: string) => Promise<string | null>; // 回傳錯誤訊息，成功為 null
  signUp: (username: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setNickname: (nickname: string) => Promise<string | null>;
  refresh: () => Promise<void>;
};

const NOT_READY = "登入功能尚未設定完成，請稍後再試";

const Ctx = createContext<AuthState | null>(null);

// 權限快取在手機裡，離線或剛打開時分頁也能正確顯示（真正的權限在資料庫擋）
const CACHE_KEY = "routemake-access";
const readCache = (): Access | null => {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    return v ? (JSON.parse(v) as Access) : null;
  } catch {
    return null;
  }
};
const writeCache = (a: Access | null) => {
  try {
    if (a) localStorage.setItem(CACHE_KEY, JSON.stringify(a));
    else localStorage.removeItem(CACHE_KEY);
  } catch {}
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const loadAccess = useCallback(async (s: Session | null) => {
    if (!s) {
      setAccess(null);
      writeCache(null);
      return;
    }
    const { data, error } = await supabase().rpc("my_access");
    if (error) return; // 離線時沿用快取
    setAccess(data as Access);
    writeCache(data as Access);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured()) {
      console.error("尚未設定 Supabase 環境變數，登入功能暫停");
      queueMicrotask(() => setReady(true));
      return;
    }
    const sb = supabase();
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        setAccess((a) => a ?? readCache());
      } else {
        setAccess(null);
        writeCache(null);
      }
      setReady(true);
      await loadAccess(data.session);
      if (data.session) void markOpen(null); // 使用狀況：今天有打開
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void loadAccess(s);
      if (event === "SIGNED_IN") void markOpen(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadAccess]);

  // 第一次登入還沒填暱稱 → 先去填；暱稱跟登入帳號一樣（舊版預設帶入帳號）也請他換一個，帳號不該公開
  useEffect(() => {
    if (session && access && needsNickname(access) && pathname !== "/welcome" && pathname !== "/login") {
      router.replace(`/welcome?next=${encodeURIComponent(herePath())}`);
    }
  }, [session, access, pathname, router]);

  const signIn = useCallback(async (username: string, password: string) => {
    if (!supabaseConfigured()) return NOT_READY;
    const { error } = await supabase().auth.signInWithPassword({ email: usernameToEmail(username), password });
    return error ? authErrorMessage(error) : null;
  }, []);

  const signUp = useCallback(async (username: string, password: string) => {
    if (!supabaseConfigured()) return NOT_READY;
    const { data, error } = await supabase().auth.signUp({ email: usernameToEmail(username), password });
    if (error) {
      // 上一次其實已經註冊成功（例如網路慢以為卡住又按一次）：密碼一樣就直接登入
      const msg = authErrorMessage(error);
      if (msg.startsWith("這個帳號名稱已經有人使用")) {
        const again = await supabase().auth.signInWithPassword({ email: usernameToEmail(username), password });
        if (!again.error) return null;
      }
      return msg;
    }
    if (!data.session) return "註冊完成，但無法自動登入：請管理員確認 Supabase 已關閉「Confirm email」";
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    clearCache();
    setSession(null);
    setAccess(null);
    writeCache(null);
  }, []);

  const setNickname = useCallback(
    async (nickname: string) => {
      if (!session) return "請先登入";
      const { error } = await supabase().from("profiles").update({ nickname }).eq("id", session.user.id);
      if (error) return error.message.includes("check") ? "暱稱要 1–16 個字" : authErrorMessage(error);
      await loadAccess(session);
      return null;
    },
    [session, loadAccess]
  );

  const refresh = useCallback(() => loadAccess(session), [loadAccess, session]);

  return <Ctx.Provider value={{ ready, session, access, signIn, signUp, signOut, setNickname, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth 要放在 AuthProvider 裡面");
  return v;
}
