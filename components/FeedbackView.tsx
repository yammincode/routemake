"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { FEEDBACK_KIND, FeedbackItem, FeedbackList } from "@/components/ui/Feedback";
import { Label, TextArea, TextField } from "@/components/ui/Form";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { getMyFeedback, sendFeedback, type Feedback, type FeedbackKind } from "@/lib/data";
import { ago } from "@/lib/date";
import { deviceLabel } from "@/lib/device";
import { lastLiveGym } from "@/lib/gyms";
import { VERSION } from "@/lib/version";

const BODY_MAX = 1000;

// 意見回饋：寫給開發者的建議、問題回報；下面列出自己送過的與處理狀態
export default function FeedbackView() {
  const { session, ready } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [body, setBody] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Feedback[] | null>(null);
  const uid = session?.user.id;

  const load = useCallback(() => {
    if (!uid) return;
    getMyFeedback(uid)
      .then(setMine)
      .catch((e) => toast((e as Error).message));
  }, [uid, toast]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (!ready) return <Empty>讀取中…</Empty>;
  if (!session)
    return (
      <SetBox>
        <p className="mt-3 mb-3 text-sub text-muted">登入後就能寫回饋給開發者，也看得到處理進度。</p>
        <Button variant="primary" onClick={() => router.push("/login?next=/feedback")}>
          登入
        </Button>
      </SetBox>
    );

  const submit = async () => {
    if (!body.trim()) return toast("請先寫下你的想法");
    setBusy(true);
    try {
      await sendFeedback({ kind, body: body.trim(), contact: contact.trim() || null, gym_id: lastLiveGym().id, app_version: VERSION, device: deviceLabel() });
      toast("已送出，謝謝你的回饋！");
      setBody("");
      setContact("");
      load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SetBox>
        <Label>類型</Label>
        <ChipRow>
          {(Object.keys(FEEDBACK_KIND) as FeedbackKind[]).map((k) => (
            <Chip key={k} pressed={kind === k} onClick={() => setKind(k)}>
              {FEEDBACK_KIND[k]}
            </Chip>
          ))}
        </ChipRow>
        <Label htmlFor="fbbody">想說的話</Label>
        <TextArea
          id="fbbody"
          maxLength={BODY_MAX}
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "bug" ? "在哪個畫面、做了什麼、發生什麼事？" : "想要什麼功能、哪裡不好用，都可以說"}
        />
        <p className="mt-1 mb-0 text-right text-tiny text-muted">
          {body.length} / {BODY_MAX}
        </p>
        <Label htmlFor="fbcontact">聯絡方式（選填）</Label>
        <TextField id="fbcontact" maxLength={100} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="想收到回覆，可以留 LINE ID 或 Email" />
        <Tip>只有開發者看得到。會一起附上 App 版本 v{VERSION}、目前的館和手機類型，方便查問題。</Tip>
      </SetBox>
      <Button variant="primary" disabled={busy || !body.trim()} onClick={() => void submit()}>
        {busy ? "送出中…" : "送出回饋"}
      </Button>

      <SectionTitle>我送出的</SectionTitle>
      {mine == null ? (
        <Empty>讀取中…</Empty>
      ) : mine.length === 0 ? (
        <Empty>還沒有送過回饋。</Empty>
      ) : (
        <FeedbackList>
          {mine.map((f) => (
            <FeedbackItem key={f.id} kind={f.kind} status={f.status} when={ago(f.created_at)}>
              {f.body}
            </FeedbackItem>
          ))}
        </FeedbackList>
      )}
    </>
  );
}
