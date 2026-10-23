"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, OptionGrid, TextArea, Toggle } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { saveTrainingDay, TRAINING_HOURS, TRAINING_KINDS, type TrainingDay, type TrainingKind } from "@/lib/data";

// 那天的日誌：感覺 1–5、爬多久、練什麼（可複選）、一句話（100 字）、公開到人物卡（預設不公開）；不收身體狀況
export default function DiaryEditor({
  userId,
  day,
  value,
  cardPublic,
  onSaved,
  onCancel,
}: {
  userId: string;
  day: string;
  value: TrainingDay | null;
  cardPublic: boolean | null; // 人物卡有沒有公開（null＝不知道）：沒公開時開關旁邊說明別人還看不到
  onSaved: (d: TrainingDay) => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [feel, setFeel] = useState<number | null>(value?.feel ?? null);
  const [hours, setHours] = useState<number | null>(value?.hours ?? null);
  const [kinds, setKinds] = useState<TrainingKind[]>(value?.kinds ?? []);
  const [note, setNote] = useState(value?.note ?? "");
  const [pub, setPub] = useState(value?.is_public ?? false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const d: TrainingDay = { day, feel, hours, kinds, note: note.trim() || null, is_public: pub };
    setBusy(true);
    try {
      await saveTrainingDay(userId, d);
      onSaved(d);
      toast("已儲存日誌");
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };
  const toggleKind = (k: TrainingKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : TRAINING_KINDS.map((x) => x.v).filter((x) => x === k || ks.includes(x))));

  return (
    <div className="mt-2 rounded-tile bg-sunk px-3 pt-1 pb-3">
      <Label>今天感覺</Label>
      <div role="radiogroup" aria-label="感覺" className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={feel === n}
            aria-label={`感覺 ${n} 分`}
            onClick={() => setFeel(feel === n ? null : n)}
            className={`rounded-full border py-1 font-num text-[15px] font-semibold ${feel != null && n <= feel ? "border-flash bg-flash/25 text-ink" : "border-line text-muted"} aria-checked:bg-flash aria-checked:text-flash-ink`}
          >
            {n}
          </button>
        ))}
      </div>
      <Label>爬了多久</Label>
      <OptionGrid cols={3} options={TRAINING_HOURS.map((h) => ({ v: String(h.v), label: h.t }))} value={hours ? String(hours) : null} onChange={(v) => setHours(v ? +v : null)} />
      <Label>練了什麼（可以複選）</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {TRAINING_KINDS.map((k) => (
          <button
            key={k.v}
            type="button"
            aria-pressed={kinds.includes(k.v)}
            onClick={() => toggleKind(k.v)}
            className="rounded-field border border-line px-0.5 py-2 text-note whitespace-nowrap aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
          >
            {k.t}
          </button>
        ))}
      </div>
      <Label htmlFor={`diary-${day}`}>一句話</Label>
      <TextArea id={`diary-${day}`} maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder="今天哪一條最有感？下次想練什麼？" />
      <Toggle
        checked={pub}
        onChange={setPub}
        label="公開到人物卡"
        hint={pub && cardPublic === false ? "你的人物卡還沒公開，公開人物卡後別人才看得到" : "公開後別人看得到這天的路線和這篇日誌（私人心得不會公開）"}
      />
      <div className="mt-1">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          儲存日誌
        </Button>
        {onCancel && (
          <Button disabled={busy} onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </div>
  );
}
