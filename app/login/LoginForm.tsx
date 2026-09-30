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

export default function LoginForm() {
  const { signIn, signUp, session, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
    const err = mode === "login" ? await signIn(username, password) : await signUp(username, password);
    setBusy(false);
    if (err) return setError(err);
    router.replace(next);
  };

  const switchMode = (m: "login" | "signup") => {
    setMode(m);
    setError(null);
  };

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
          {mode === "signup" && <Tip>{USERNAME_RULE}，註冊後不能改</Tip>}
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
          <Link href="/rules" className="text-accent underline">留言規範</Link>。
        </Tip>
      )}
    </>
  );
}
