"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Label, TextField, Toggle } from "@/components/ui/Form";
import { SetBox } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { getSlamClaims, getSlamInfo, setSlamSettings, type SlamListItem } from "@/lib/data";
import { gradeLabel } from "@/lib/design";
import { findGym } from "@/lib/gyms";
import { showCode, slamDate, slamTime } from "@/lib/slam";

type Form = { enabled: boolean; min: string; days: string; prize: string };

// 老闆：大滿貫兌換活動開關、條件、獎品文字；最近的兌換紀錄
export default function SlamOpsView() {
  const { access } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [list, setList] = useState<SlamListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 讀到紀錄的時間（判斷過期用；畫面上不另外算現在時間）
  const [readAt, setReadAt] = useState(0);
  const owner = !!access?.is_owner;

  const load = useCallback(async () => {
    try {
      const i = await getSlamInfo();
      if (!i) throw new Error("資料庫還沒套用大滿貫兌換（step40），請先在 Supabase 執行 step40");
      setForm({ enabled: i.enabled, min: String(i.min_routes), days: String(i.valid_days), prize: i.prize ?? "" });
      setList(await getSlamClaims());
      setReadAt(Date.now());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (owner) void Promise.resolve().then(load);
  }, [owner, load]);

  if (!owner) return <Empty>大滿貫兌換設定只有老闆可以改。</Empty>;
  if (error)
    return (
      <>
        <Empty>{error}</Empty>
        <div className="mt-3">
          <Button onClick={() => void load()}>重新整理</Button>
        </div>
      </>
    );
  if (!form) return <Empty>讀取中…</Empty>;

  const min = Number(form.min);
  const days = Number(form.days);
  const ok = Number.isInteger(min) && min >= 1 && min <= 500 && Number.isInteger(days) && days >= 1 && days <= 365 && form.prize.trim().length <= 40;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await setSlamSettings({ enabled: form.enabled, min_routes: min, valid_days: days, prize: form.prize.trim() || null });
      toast("已儲存大滿貫兌換設定");
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <>
      <SetBox>
        <Toggle
          checked={form.enabled}
          onChange={(v) => setForm({ ...form, enabled: v })}
          label="活動開關"
          hint={form.enabled ? "開著：顧客大滿貫的難度會出現「★ 兌換 ›」" : "關著：只有老闆看得到兌換按鈕（可以先試），員工也不能兌換"}
        />
        <Label htmlFor="slam-min">最少條數（這個難度牆上至少幾條才能兌換）</Label>
        <TextField id="slam-min" inputMode="numeric" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value.replace(/\D/g, "") })} />
        <Label htmlFor="slam-days">兌換期限（拿到兌換碼後幾天內）</Label>
        <TextField id="slam-days" inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, "") })} />
        <Label htmlFor="slam-prize">獎品（顯示在兌換卡上，沒填寫「洽櫃檯」）</Label>
        <TextField id="slam-prize" maxLength={40} value={form.prize} placeholder="例如 原岩毛巾" onChange={(e) => setForm({ ...form, prize: e.target.value })} />
        <div className="mt-3">
          <Button variant="primary" disabled={!ok || busy} onClick={() => void save()}>
            {busy ? "儲存中…" : "儲存"}
          </Button>
        </div>
        <Tip>最少條數 1–500、期限 1–365 天。每個人每個難度只能兌換一次；兌換時資料庫會重新檢查牆上的路線真的全部完成。</Tip>
      </SetBox>

      <SectionTitle>兌換紀錄</SectionTitle>
      {!list ? (
        <Empty>讀取中…</Empty>
      ) : list.length === 0 ? (
        <Empty>還沒有人拿兌換碼。</Empty>
      ) : (
        <div role="list" className="grid gap-2" aria-label="兌換紀錄">
          {list.map((c) => (
            <Card key={c.code} role="listitem" className="px-3.5 py-2.5 text-note">
              <div className="flex items-baseline justify-between gap-2">
                <b className="truncate">
                  {c.nickname ?? "（沒有暱稱）"} <span className="font-num text-sub">{gradeLabel(c.grade)}</span>
                </b>
                <span className={`flex-none text-meta font-bold ${c.redeemed_at ? "" : "text-muted"}`}>
                  {c.redeemed_at ? "已兌換" : Date.parse(c.expires_at) <= readAt ? "過期" : "還沒兌換"}
                </span>
              </div>
              <p className="m-0 text-meta text-muted">
                {showCode(c.code)}・
                {c.redeemed_at
                  ? `${slamTime(c.redeemed_at)} ${findGym(c.redeemed_gym ?? "")?.name ?? ""}${c.redeemed_by ? `・${c.redeemed_by}` : ""}`
                  : `${slamDate(c.created_at)} 拿到碼，${slamDate(c.expires_at)} 前`}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
