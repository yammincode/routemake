"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SuspendedLine } from "@/components/ui/Account";
import { Button, LinkButton } from "@/components/ui/Button";
import { Check, Label, OptionGrid, TextField } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { suspendUser, unsuspendUser, type AccountInfo } from "@/lib/data";

type Days = "3" | "7" | "30" | "forever";
const DAY_LABEL: Record<Days, string> = { "3": "3 天", "7": "7 天", "30": "30 天", forever: "永久" };

// 停權這個帳號（店長、老闆）：期限、原因（對方會看到）、同時刪掉留言、按兩次確認
// 已經停權：顯示到哪天、原因，可以提早解除（永久的只有老闆能解除）
// 人物卡（點留言上的名字）和後台「帳號管理」共用
export default function SuspendBox({ info, gymId, onDone }: { info: AccountInfo; gymId: string; onDone: () => void }) {
  const { access } = useAuth();
  const toast = useToast();
  const owner = !!access?.is_owner;
  const [days, setDays] = useState<Days | null>("7");
  const [reason, setReason] = useState("");
  // 店長只刪得到這館的留言，老闆刪全部
  const wipeCount = owner ? info.comments : info.comments_here;
  const [wipe, setWipe] = useState(wipeCount > 0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (info.staff) return <p className="mt-2 mb-0 text-meta text-muted">員工和老闆不能停權（要先移除員工身分）。</p>;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      onDone();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  if (info.suspension) {
    const s = info.suspension;
    return (
      <>
        <SuspendedLine until={s.until} reason={s.reason} by={s.by} at={s.at} />
        {(owner || (s.until && s.mine)) && (
          <Button className="mt-2" disabled={busy} onClick={() => void run(() => unsuspendUser(info.id, gymId), `已解除 ${info.nickname ?? info.username} 的停權`)}>
            {s.until ? "提早解除停權" : "解除停權"}
          </Button>
        )}
        {!owner && !(s.until && s.mine) && <small className="mt-1 block text-tiny text-muted">{s.until ? "別人停的權，要提早解除請找他或老闆" : "永久停權只有老闆可以解除"}</small>}
      </>
    );
  }

  const options = (owner ? (["3", "7", "30", "forever"] as Days[]) : (["3", "7", "30"] as Days[])).map((v) => ({ v, label: DAY_LABEL[v] }));
  const ready = !!days && reason.trim().length > 0;
  const submit = () => {
    if (!ready) return toast(days ? "請寫停權原因" : "請選停權多久");
    if (!confirm) return setConfirm(true);
    void run(
      () => suspendUser(info.id, gymId, days === "forever" ? null : Number(days), reason.trim(), wipe),
      `已停權 ${info.nickname ?? info.username}${days === "forever" ? "（永久）" : ` ${DAY_LABEL[days!]}`}`
    );
  };

  return (
    <div data-suspend-form className="mt-3 rounded-tile bg-sunk p-3">
      <b className="block text-sub">停權這個帳號</b>
      <Label>停權多久</Label>
      <OptionGrid options={options} value={days} onChange={(v) => (setDays(v), setConfirm(false))} cols={owner ? 4 : 3} />
      {!owner && <small className="mt-1 block text-tiny text-muted">永久停權只有老闆能選</small>}
      <Label htmlFor={`why-${info.id}`}>原因（他會看到）</Label>
      <TextField id={`why-${info.id}`} maxLength={60} value={reason} onChange={(e) => (setReason(e.target.value), setConfirm(false))} placeholder="例如 留言騷擾其他顧客" />
      {wipeCount > 0 && (
        <Check checked={wipe} onChange={setWipe}>
          {owner ? `同時刪掉他所有留言（${wipeCount} 則）` : `同時刪掉他在這館的留言（${wipeCount} 則）`}
        </Check>
      )}
      <Button variant="danger" className="mt-3" disabled={busy} onClick={submit}>
        {confirm ? `確定停權${days === "forever" ? "（永久）" : ` ${DAY_LABEL[days!]}`}？再按一次` : `停權${days ? (days === "forever" ? "（永久）" : ` ${DAY_LABEL[days]}`) : ""}`}
      </Button>
      {confirm && <LinkButton onClick={() => setConfirm(false)}>取消</LinkButton>}
      <small className="mt-1 block text-center text-tiny text-muted">會記在操作紀錄</small>
    </div>
  );
}
