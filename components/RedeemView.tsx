"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card, Empty, PageTitle, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Label, TextField } from "@/components/ui/Form";
import { tapeLook } from "@/components/ui/Gym";
import { useToast } from "@/components/ui/Toast";
import { isStaff, staffGyms } from "@/lib/auth";
import { lookupSlam, redeemSlam, type SlamLookup } from "@/lib/data";
import { gradeLabel } from "@/lib/design";
import { findGym, GYMS } from "@/lib/gyms";
import { normCode, showCode, slamDate, slamTime, ymdSlash } from "@/lib/slam";

// 上次在哪一館兌換，記在這支手機（櫃檯的手機通常固定在一館）
const GYM_KEY = "routemake-redeem-gym";
const savedGym = () => {
  try {
    return localStorage.getItem(GYM_KEY);
  } catch {
    return null;
  }
};

// 員工兌換頁：掃顧客兌換卡上的 QR code 打開（/redeem?c=兌換碼），也可以手打兌換碼
// 核對暱稱 → 選館 → 「確認兌換」；能不能兌換一律由資料庫重新檢查
export default function RedeemView() {
  const { ready, session, access } = useAuth();
  const router = useRouter();
  const code = normCode(useSearchParams().get("c") ?? "");
  const next = `/redeem${code ? `?c=${code}` : ""}`;

  if (!ready || (session && !access)) return <Empty>讀取中…</Empty>;
  if (!session || !isStaff(access))
    return (
      <>
        <PageTitle>大滿貫兌換</PageTitle>
        <Empty>這是櫃檯員工兌換用的頁面。顧客請把手機上的兌換卡給櫃檯員工掃 QR code。</Empty>
        {!session && (
          <div className="mt-3">
            <Button onClick={() => router.push(`/login?next=${encodeURIComponent(next)}`)}>我是員工，登入</Button>
          </div>
        )}
      </>
    );
  return <StaffRedeem key={code} code={code} />;
}

function StaffRedeem({ code }: { code: string }) {
  const { access } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = useState<SlamLookup | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  // 查到的時間（判斷過期用）
  const [readAt, setReadAt] = useState(0);
  // 可以選的館：老闆是全部開放的館，員工是自己有權限的館
  const mine = staffGyms(access);
  const gyms = GYMS.filter((g) => g.live && (mine === null || mine.includes(g.id)));
  const [gym, setGym] = useState<string | null>(() => {
    const s = savedGym();
    return gyms.length === 1 ? gyms[0].id : s && gyms.some((g) => g.id === s) ? s : null;
  });

  const load = useCallback(async () => {
    if (!code) return;
    setError(null);
    try {
      setC(await lookupSlam(code));
      setReadAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [code]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const pickGym = (id: string) => {
    setGym(id);
    try {
      localStorage.setItem(GYM_KEY, id);
    } catch {}
  };

  const redeem = async () => {
    if (!c || !gym || busy) return;
    setBusy(true);
    try {
      const r = await redeemSlam(c.code, gym);
      setC({ ...c, ...r, redeemed_by: access?.nickname ?? null });
      toast(`已兌換：${c.nickname ?? ""} ${gradeLabel(c.grade)} 大滿貫`);
    } catch (e) {
      toast((e as Error).message);
      void load();
    }
    setBusy(false);
  };

  const manual = (
    <form
      className="mt-5"
      onSubmit={(e) => {
        e.preventDefault();
        const t = normCode(typed);
        if (t.length === 8) router.replace(`/redeem?c=${t}`);
        else toast("兌換碼是 8 個英文字母和數字");
      }}
    >
      <Label htmlFor="redeem-code">{code ? "換一組兌換碼" : "掃不到 QR code：輸入兌換碼"}</Label>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <TextField
          id="redeem-code"
          className="min-w-0"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="例如 K7Q4-82MD"
          autoCapitalize="characters"
          autoComplete="off"
        />
        <Button type="submit">查詢</Button>
      </div>
    </form>
  );

  const head = <PageTitle sub="核對暱稱後按「確認兌換」">大滿貫兌換</PageTitle>;
  if (!code)
    return (
      <>
        {head}
        <Tip>用手機相機掃顧客兌換卡上的 QR code，會直接打開這一頁。</Tip>
        {manual}
      </>
    );
  if (error)
    return (
      <>
        {head}
        <Empty>{error}</Empty>
        <div className="mt-3">
          <Button onClick={() => void load()}>重新整理</Button>
        </div>
        {manual}
      </>
    );
  if (c === undefined)
    return (
      <>
        {head}
        <Empty>查詢中…</Empty>
      </>
    );
  if (c === null)
    return (
      <>
        {head}
        <Empty>找不到兌換碼 {showCode(code)}，請顧客重新打開兌換卡再掃一次。</Empty>
        {manual}
      </>
    );

  const expired = !c.redeemed_at && Date.parse(c.expires_at) <= readAt;
  const notDone = c.now_done < c.now_total || c.now_total < c.min_routes;
  const closed = !c.enabled && !access?.is_owner;
  const problem = c.redeemed_at
    ? null
    : closed
      ? "大滿貫兌換活動還沒開始，不能兌換。"
      : expired
        ? "兌換碼過期了，請顧客重新打開兌換卡拿新的碼。"
        : notDone
          ? `牆上的 ${gradeLabel(c.grade)} 現在沒有全部完成（${c.now_done} / ${c.now_total} 條），不能兌換。`
          : null;
  const t = tapeLook(c.grade);
  return (
    <>
      {head}
      <Card className="px-4 pt-3.5 pb-4" data-slam-lookup>
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-10 min-w-14 items-center justify-center rounded-cell px-2 font-num text-num-card font-bold ${t.cls}`} style={t.style}>
            {gradeLabel(c.grade)}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-tiny text-muted">暱稱（請核對顧客的兌換卡）</p>
            <p className="m-0 truncate text-sheet font-bold">{c.nickname ?? "（沒有暱稱）"}</p>
          </div>
        </div>
        <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-note">
          <dt className="text-muted">兌換碼</dt>
          <dd className="m-0 font-num text-sub font-bold tracking-wider">{showCode(c.code)}</dd>
          <dt className="text-muted">達成</dt>
          <dd className="m-0">
            {ymdSlash(c.achieved_on)}（全原岩 {c.total} 條 {gradeLabel(c.grade)}）
          </dd>
          <dt className="text-muted">現在牆上</dt>
          <dd className="m-0">
            {notDone ? "✗" : "✓"} 完成 {c.now_done} / {c.now_total} 條
          </dd>
          {c.redeemed_at ? (
            <>
              <dt className="text-muted">兌換</dt>
              <dd className="m-0 font-bold">
                {slamTime(c.redeemed_at)}・{findGym(c.redeemed_gym ?? "")?.name}
                {c.redeemed_by ? `・${c.redeemed_by}` : ""}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-muted">期限</dt>
              <dd className="m-0">{slamDate(c.expires_at)} 前</dd>
            </>
          )}
        </dl>
      </Card>

      {c.redeemed_at ? (
        <p className="mt-3 mb-0 rounded-tile bg-accent-soft p-4 text-sub font-bold" role="status">
          ★ 已兌換，請把獎品交給顧客。同一組碼不能再用。
        </p>
      ) : problem ? (
        <p className="mt-3 mb-0 rounded-tile bg-surface p-4 text-sub font-bold text-warn" role="alert">
          {problem}
        </p>
      ) : (
        <>
          <SectionTitle>在哪一館兌換</SectionTitle>
          <ChipRow wrap>
            {gyms.map((g) => (
              <Chip key={g.id} pressed={gym === g.id} onClick={() => pickGym(g.id)}>
                {g.name}
              </Chip>
            ))}
          </ChipRow>
          <div className="mt-4">
            <Button variant="primary" disabled={!gym || busy} onClick={() => void redeem()}>
              {busy ? "兌換中…" : gym ? `確認兌換（${findGym(gym)?.name}）` : "先選館"}
            </Button>
          </div>
          <Tip>按下去就記成已兌換（哪一館、哪位員工、什麼時候），顧客的兌換卡會自動蓋上「已兌換」。</Tip>
        </>
      )}
      {manual}
    </>
  );
}
