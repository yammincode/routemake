"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import LoginGate from "@/components/LoginGate";
import { Button } from "@/components/ui/Button";
import { BackLink, Empty, Tip } from "@/components/ui/Card";
import { SlamTicket } from "@/components/ui/Slam";
import { claimSlam, getSlamInfo, type SlamClaim, type SlamInfo } from "@/lib/data";
import { findGym } from "@/lib/gyms";
import { backOr } from "@/lib/nav";
import { NETWORK_RE } from "@/lib/net";
import { claimOf, redeemUrl, showCode, slamDate, slamTime, ymdSlash } from "@/lib/slam";

// 還沒兌換時每幾秒看一下員工兌換了沒（資料很小）；兌換完、過期、開著超過 10 分鐘就停（有「重新整理」）
const POLL_MS = 4000;
const POLL_FOR_MS = 10 * 60 * 1000;

// 大滿貫兌換卡：打開時跟資料庫拿兌換碼（資料庫重新檢查全部完成），兌換過的直接顯示蓋章
// 要先登入（登入後回到這張卡）
export default function SlamView() {
  const g = useSearchParams().get("g");
  return (
    <LoginGate next={encodeURIComponent(`/slam?g=${g ?? ""}`)} intro="大滿貫兌換卡要登入才看得到">
      <SlamCard g={g} />
    </LoginGate>
  );
}

function SlamCard({ g }: { g: string | null }) {
  const router = useRouter();
  const grade = Number(g);
  const valid = !!g && Number.isInteger(grade);
  const { access } = useAuth();
  const [info, setInfo] = useState<SlamInfo | null>(null);
  const [claim, setClaim] = useState<SlamClaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [stopped, setStopped] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setOffline(false);
    setStopped(false);
    try {
      const i = await getSlamInfo();
      if (!i) throw new Error("大滿貫兌換還沒開放");
      setInfo(i);
      const old = claimOf(i, grade);
      setClaim(old?.redeemed_at ? old : await claimSlam(grade));
    } catch (e) {
      const m = (e as Error).message;
      if (!navigator.onLine || NETWORK_RE.test(m) || m.includes("連不上網路")) setOffline(true);
      // 牆上進度會先算手機裡還沒送出的紀錄，資料庫還沒收到
      else setError(m.includes("沒完成") ? `${m}。手機裡還沒送出的紀錄要送出後才算，請連上網路稍等再打開。` : m);
    }
  }, [grade]);

  useEffect(() => {
    if (valid) void Promise.resolve().then(load);
  }, [valid, load]);

  // 員工按了兌換，這邊自動變成已兌換
  const waiting = !!claim && !claim.redeemed_at;
  useEffect(() => {
    if (!waiting || !claim) return;
    const until = Date.now() + POLL_FOR_MS;
    const id = setInterval(() => {
      if (document.hidden) return;
      // 過期了：重新拿一組新的碼；開太久：先停，按「重新整理」再看
      if (Date.parse(claim.expires_at) <= Date.now()) {
        clearInterval(id);
        void load();
        return;
      }
      if (Date.now() > until) {
        clearInterval(id);
        setStopped(true);
        return;
      }
      getSlamInfo()
        .then((i) => {
          const c = i?.claims.find((x) => x.code === claim.code);
          if (c?.redeemed_at) setClaim(c);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [waiting, claim, load]);

  const back = <BackLink onClick={() => backOr(router, "/me")}>我的紀錄</BackLink>;
  if (!valid)
    return (
      <>
        {back}
        <Empty>找不到這張兌換卡，請從「我的紀錄 → 路線進度 → 牆上進度」打開。</Empty>
      </>
    );
  if (offline || error)
    return (
      <>
        {back}
        <Empty>{offline ? "要連上網路才能打開兌換卡（要跟資料庫確認你真的全部完成）。" : error}</Empty>
        <div className="mt-3">
          <Button onClick={() => void load()}>重新整理</Button>
        </div>
      </>
    );
  if (!claim || !info)
    return (
      <>
        {back}
        <Empty>確認中…</Empty>
      </>
    );
  return (
    <>
      {back}
      <div className="mt-1.5">
        <SlamTicket
          grade={claim.grade}
          total={claim.total}
          achievedOn={ymdSlash(claim.achieved_on)}
          nickname={access?.nickname ?? ""}
          code={showCode(claim.code)}
          qr={redeemUrl(location.origin, claim.code)}
          prize={info.prize}
          expires={slamDate(claim.expires_at)}
          redeemed={claim.redeemed_at ? { when: slamTime(claim.redeemed_at), gym: findGym(claim.redeemed_gym ?? "")?.name ?? "" } : null}
        />
      </div>
      {!claim.redeemed_at && <Tip>櫃檯掃不到的話，把螢幕亮度調高，或念兌換碼給員工輸入。員工兌換後這張會自動蓋上「已兌換」。</Tip>}
      {stopped && !claim.redeemed_at && <Button onClick={() => void load()}>重新整理（看兌換了沒）</Button>}
    </>
  );
}
