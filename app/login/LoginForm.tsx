"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { lastGymPath } from "@/lib/gyms";
import { backOr, safeInternalPath } from "@/lib/nav";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { BackLink, PageTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Label, TextField } from "@/components/ui/Form";
import { SetBox } from "@/components/ui/Stats";
import { isValidUsername, PASSWORD_MIN, USERNAME_RULE } from "@/lib/auth";

// 只允許站內路徑，避免被導到別的網站
const safeNext = (n: string | null) => safeInternalPath(n, lastGymPath());

// 最多等 15 秒：網路慢或瀏覽器卡住時不會一直停在「請稍候…」
const WAIT_MS = 15000;
const TOO_SLOW = "連線太久沒有回應，請確認網路後再按一次（帳號如果已經建好，再按一次會直接登入）";
const withTimeout = (p: Promise<string | null>) =>
  Promise.race([p, new Promise<string>((res) => setTimeout(() => res(TOO_SLOW), WAIT_MS))]);

// 邊打邊提示：帳號名稱、密碼還差什麼
function usernameHint(u: string): { ok: boolean; text: string } | null {
  if (!u) return null;
  if (/[^a-z0-9_]/.test(u)) return { ok: false, text: "只能用英文字母、數字或底線" };
  if (u.length < 4) return { ok: false, text: `還差 ${4 - u.length} 個字（至少 4 個字）` };
  return { ok: true, text: "✓ 可以使用這個格式" };
}
function passwordHint(p: string): { ok: boolean; text: string } | null {
  if (!p) return null;
  if (p.length < PASSWORD_MIN) return { ok: false, text: `還差 ${PASSWORD_MIN - p.length} 碼` };
  return { ok: true, text: "✓ 密碼長度可以" };
}

export default function LoginForm() {
  const { signIn, signUp, session, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // 註冊時預設顯示密碼，看得到自己打了什麼比較不會打錯
  const [showPw, setShowPw] = useState(mode === "signup");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 已經登入就直接回去
  useEffect(() => {
    if (ready && session) router.replace(next);
  }, [ready, session, next, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidUsername(username)) return setError(`帳號名稱要 ${USERNAME_RULE}`);
    if (password.length < PASSWORD_MIN) return setError(`密碼至少 ${PASSWORD_MIN} 碼`);
    setBusy(true);
    const err = await withTimeout(mode === "login" ? signIn(username, password) : signUp(username, password));
    setBusy(false);
    if (err) return setError(err);
    router.replace(next);
  };

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setShowPw(m === "signup");
    setError(null);
  };
  const uHint = mode === "signup" ? usernameHint(username) : null;
  const pHint = mode === "signup" ? passwordHint(password) : null;

  return (
    <>
      <BackLink onClick={() => backOr(router, next)}>返回</BackLink>
      <PageTitle sub={mode === "login" ? "登入後就能記錄完攀、寫心得和留言" : "取一個帳號名稱，設定密碼就能開始使用"}>
        {mode === "login" ? "登入" : "註冊帳號"}
      </PageTitle>
      <ChipRow>
        <Chip pressed={mode === "login"} onClick={() => switchMode("login")}>
          登入
        </Chip>
        <Chip pressed={mode === "signup"} onClick={() => switchMode("signup")}>
          註冊
        </Chip>
      </ChipRow>
      <form onSubmit={submit} noValidate>
        <SetBox>
          <Label htmlFor="username">帳號名稱</Label>
          <TextField
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
            placeholder="例如 climber88"
          />
          {mode === "signup" && (
            <Tip>
              {USERNAME_RULE}，註冊後不能改
              {uHint && (
                <span data-hint="username" className={`block font-bold ${uHint.ok ? "text-ink" : "text-warn"}`}>
                  {uHint.text}
                </span>
              )}
            </Tip>
          )}
          <Label htmlFor="password">密碼</Label>
          <TextField
            id="password"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            autoCapitalize="none"
            autoCorrect="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`至少 ${PASSWORD_MIN} 碼`}
          />
          {mode === "signup" && (
            <Tip>
              至少 {PASSWORD_MIN} 碼，英文、數字都可以，不用大小寫或符號
              {pHint && (
                <span data-hint="password" className={`block font-bold ${pHint.ok ? "text-ink" : "text-warn"}`}>
                  {pHint.text}
                </span>
              )}
            </Tip>
          )}
          <label className="mt-2.5 flex items-center gap-2 text-note text-muted">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
            顯示密碼
          </label>
        </SetBox>
        {error && (
          <p role="alert" className="mt-0 mb-3 text-note font-bold text-warn">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "請稍候…" : mode === "login" ? "登入" : "註冊並登入"}
        </Button>
      </form>
      {mode === "login" ? (
        <Tip>忘記密碼請洽櫃檯。</Tip>
      ) : (
        <Tip>
          註冊即表示你同意
          <Link href="/privacy" className="text-accent underline">隱私權政策</Link>和
          <Link href="/rules" className="text-accent underline">留言與影片規範</Link>。
        </Tip>
      )}
    </>
  );
}
