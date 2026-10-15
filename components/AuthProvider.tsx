"use client";

import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authErrorMessage, PASSWORD_MIN, usernameToEmail, type Access } from "@/lib/auth";
import { herePath } from "@/lib/nav";
import { clearCache } from "@/lib/offline";
import { AUTH_STORAGE_KEY, storedLogin, supabase, supabaseConfigured } from "@/lib/supabase";
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
  changePassword: (oldPassword: string, newPassword: string) => Promise<string | null>; // 回傳錯誤訊息，成功為 null
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
      // 登入自己失效（例如老闆重設密碼）：清掉手機裡的個人資料；還沒送出的紀錄留著，同一個人再登入後照樣送出
      if (event === "SIGNED_OUT") clearCache(true);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") void loadAccess(s);
      if (event === "SIGNED_IN") void markOpen(null);
    });
    // 回到 App（從背景切回來）重新讀權限和停權狀態：店長剛停權或解除時，不用把 App 關掉重開
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void sb.auth.getSession().then(({ data }) => data.session && loadAccess(data.session));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadAccess]);

  // 第一次登入還沒填暱稱 → 先去填；暱稱跟登入帳號一樣（舊版預設帶入帳號）也請他換一個，帳號不該公開
  useEffect(() => {
    // 停權中不能改暱稱：不要帶去取暱稱（會卡住）
    if (session && access && !access.suspension && needsNickname(access) && pathname !== "/welcome" && pathname !== "/login") {
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

  // 只登出這支手機（其他手機不受影響）
  // 先清掉手機裡的登入，馬上登出（沒網路、登入過期也一樣，下一個人打開不會又登入成前一個人）；
  // 再在背景通知伺服器撤銷這支手機的登入（這個請求不會動手機裡的資料，之後有人登入不會被它登出）
  const signOut = useCallback(async () => {
    const token = storedLogin()?.access_token;
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(AUTH_STORAGE_KEY))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    await supabase()
      .auth.signOut({ scope: "local" })
      .catch(() => undefined);
    if (token) void supabase().auth.admin.signOut(token, "local").catch(() => undefined);
    clearCache();
    setSession(null);
    setAccess(null);
    writeCache(null);
  }, []);

  const setNickname = useCallback(
    async (nickname: string) => {
      if (!session) return "請先登入";
      const { error } = await supabase().from("profiles").update({ nickname }).eq("id", session.user.id);
      // 資料庫的中文訊息直接顯示（例如不能用「店長」這類字）
      if (error) return /[一-鿿]/.test(error.message) ? error.message : error.message.includes("check") ? "暱稱要 1–16 個字" : authErrorMessage(error);
      await loadAccess(session);
      return null;
    },
    [session, loadAccess]
  );

  // 改密碼：先用現在的密碼登入一次確認是本人，再改成新密碼
  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      if (!session || !access?.username) return "請先登入";
      if (newPassword.length < PASSWORD_MIN) return `新密碼至少 ${PASSWORD_MIN} 碼`;
      const check = await supabase().auth.signInWithPassword({ email: usernameToEmail(access.username), password: oldPassword });
      if (check.error) return authErrorMessage(check.error) === "帳號或密碼錯誤" ? "現在的密碼不對" : authErrorMessage(check.error);
      const { error } = await supabase().auth.updateUser({ password: newPassword });
      if (error) {
        if (error.code === "same_password") return "新密碼跟現在的一樣";
        if (error.code === "reauthentication_needed") return "請登出後再登入一次，再改密碼";
        if (/72/.test(error.message ?? "")) return "新密碼太長了";
        return authErrorMessage(error);
      }
      return null;
    },
    [session, access]
  );

  const refresh = useCallback(() => loadAccess(session), [loadAccess, session]);

  return <Ctx.Provider value={{ ready, session, access, signIn, signUp, signOut, setNickname, changePassword, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth 要放在 AuthProvider 裡面");
  return v;
}
