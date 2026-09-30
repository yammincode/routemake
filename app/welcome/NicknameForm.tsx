"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { lastGymPath } from "@/lib/gyms";
import { safeInternalPath } from "@/lib/nav";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { PageTitle, Tip } from "@/components/ui/Card";
import { Label, TextField } from "@/components/ui/Form";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";

const safeNext = (n: string | null) => {
  const p = safeInternalPath(n, lastGymPath());
  return p.startsWith("/welcome") ? lastGymPath() : p;
};

// 第一次登入填暱稱（也用來改暱稱）；預設帶入帳號名稱
export default function NicknameForm() {
  const { ready, session, access, setNickname } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const toast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [ready, session, next, router]);

  const shown = value ?? access?.nickname ?? access?.username ?? "";
  const first = !access?.nickname;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nick = shown.trim();
    if (nick.length < 1 || nick.length > 16) return setError("暱稱要 1–16 個字");
    setBusy(true);
    const err = await setNickname(nick);
    setBusy(false);
    if (err) return setError(err);
    toast(first ? `歡迎，${nick}！` : "已更新暱稱");
    router.replace(next);
  };

  return (
    <>
      <PageTitle sub={first ? "留言時會顯示這個名字，之後可以在「我的紀錄」修改" : "留言時會顯示這個名字"}>
        {first ? "取個暱稱" : "修改暱稱"}
      </PageTitle>
      <form onSubmit={submit} noValidate>
        <SetBox>
          <Label htmlFor="nickname">暱稱</Label>
          <TextField id="nickname" maxLength={16} value={shown} onChange={(e) => setValue(e.target.value)} placeholder="例如 小安" />
          <Tip>1–16 個字，可以用中文</Tip>
        </SetBox>
        {error && (
          <p role="alert" className="mt-0 mb-3 text-note font-bold text-warn">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy || !access}>
          {busy ? "請稍候…" : "完成"}
        </Button>
      </form>
    </>
  );
}
