"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { BackLink, PageTitle, Tip } from "@/components/ui/Card";
import { Label, TextField } from "@/components/ui/Form";
import { SetBox } from "@/components/ui/Stats";
import { isValidUsername, PASSWORD_MIN, USERNAME_RULE } from "@/lib/auth";
import { NO_ACCOUNTS, resetPasswordWithCode } from "@/lib/data";

const RESULT_TEXT = {
  bad: "帳號或重設碼不對，請再確認一次",
  expired: "重設碼已經失效（超過 15 分鐘或打錯太多次），請到櫃檯再拿一組",
  short: `新密碼至少 ${PASSWORD_MIN} 碼`,
} as const;

// 忘記密碼：到櫃檯拿 6 位數重設碼，輸入帳號、重設碼、新密碼；設好直接登入
export default function ResetForm({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidUsername(username)) return setError(`帳號名稱要 ${USERNAME_RULE}`);
    if (!/^\d{6}$/.test(code)) return setError("重設碼是 6 位數字");
    if (password.length < PASSWORD_MIN) return setError(RESULT_TEXT.short);
    setBusy(true);
    try {
      const r = await resetPasswordWithCode(username, code, password);
      if (r !== "ok") return setError(RESULT_TEXT[r] ?? RESULT_TEXT.bad);
      const err = await signIn(username, password);
      if (err) return setError(`新密碼已經設好，但登入失敗：${err}。請回登入頁用新密碼登入`);
      onDone();
    } catch (e) {
      const m = (e as Error).message;
      setError(m === NO_ACCOUNTS ? "目前還不能線上重設密碼，請洽櫃檯" : m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BackLink onClick={onBack}>回登入</BackLink>
      <PageTitle sub="先到任一館櫃檯拿重設碼，再回來設定新密碼">重設密碼</PageTitle>
      <Tip>告訴員工你的帳號名稱或暱稱，員工核對後會給你 6 位數重設碼（15 分鐘內有效）。</Tip>
      <form onSubmit={submit} noValidate>
        <SetBox>
          <Label htmlFor="r-username">帳號名稱</Label>
          <TextField
            id="r-username"
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
          <Label htmlFor="r-code">重設碼（6 位數）</Label>
          <TextField
            id="r-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="例如 482917"
            className="font-num text-num-picker tracking-[0.2em]"
          />
          <Label htmlFor="r-password">新密碼</Label>
          <TextField
            id="r-password"
            name="new-password"
            type="text"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`至少 ${PASSWORD_MIN} 碼`}
          />
          {password && (
            <Tip>
              <span className={`font-bold ${password.length >= PASSWORD_MIN ? "text-ink" : "text-warn"}`}>
                {password.length >= PASSWORD_MIN ? "✓ 密碼長度可以" : `還差 ${PASSWORD_MIN - password.length} 碼`}
              </span>
            </Tip>
          )}
        </SetBox>
        {error && (
          <p role="alert" className="mt-0 mb-3 text-note font-bold text-warn">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "請稍候…" : "設定新密碼並登入"}
        </Button>
      </form>
      <Tip>設好後，其他手機上的登入都會登出。重設碼打錯 5 次會失效，要再請櫃檯產生。</Tip>
    </>
  );
}
