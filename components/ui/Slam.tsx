"use client";

// 大滿貫兌換卡（使用者選的 B 案票券＋C 案動態條紋和現在時間）：
// 上半段是這個難度的膠帶顏色＋大大的難度，下面一條會動的條紋、QR code、兌換碼、現在時間（秒在跳），撕線下面是暱稱、獎品、期限
// 截圖的話條紋和時間不會動，櫃檯一眼看得出來；QR code 一律白底（深色模式也是，比較好掃）
import QRCode from "qrcode";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { gradeColor, gradeLabel } from "@/lib/design";

// QR code（畫成 SVG，不用連網路）
export function QrCode({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const q = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = q.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { size: n, path: d };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
      className={`block rounded-cell bg-white ${className}`}
      shapeRendering="crispEdges"
    >
      <path d={path} fill="#15201B" />
    </svg>
  );
}

// 膠帶顏色＋Flash 黃的斜條紋，一直往右走（手機設定減少動態時不動）；stopped：已兌換，灰色不動
export function LiveStripe({ grade, stopped = false }: { grade: number; stopped?: boolean }) {
  const c = gradeColor(grade)?.bg ?? "var(--accent)";
  return (
    <div
      aria-hidden
      data-live-stripe={stopped ? "stopped" : "live"}
      className={`h-3 w-full ${stopped ? "bg-line" : "animate-slam-stripe"}`}
      style={
        stopped
          ? undefined
          : {
              background: `repeating-linear-gradient(-45deg, ${c} 0 12px, var(--flash) 12px 24px)`,
              backgroundSize: "34px 34px",
            }
      }
    />
  );
}

// 現在時間（台北，秒在跳）
const clockText = () =>
  new Date().toLocaleTimeString("zh-TW", {
    hour12: false,
    timeZone: "Asia/Taipei",
  });
export function LiveClock() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setT(clockText());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return (
    <p className="m-0 text-center leading-tight">
      <span className="block text-tiny text-muted">現在時間</span>
      <b data-live-clock className="font-num text-num-stat font-bold tabular-nums">
        {t ?? "--:--:--"}
      </b>
    </p>
  );
}

export type SlamTicketProps = {
  grade: number;
  total: number; // 牆上幾條
  achievedOn: string; // 2026/10/12
  nickname: string;
  code: string; // 顯示用 K7Q4-82MD
  qr: string; // QR code 內容（員工兌換頁網址）
  prize: string | null;
  expires: string; // 2026/11/11
  redeemed?: { when: string; gym: string } | null;
};

// 兌換卡（票券）
export function SlamTicket({ grade, total, achievedOn, nickname, code, qr, prize, expires, redeemed }: SlamTicketProps) {
  const tape = gradeColor(grade);
  const g = gradeLabel(grade);
  return (
    <section aria-label={`${g} 大滿貫兌換卡`} data-redeemed={redeemed ? "1" : undefined} className="overflow-hidden rounded-card bg-surface shadow-card">
      <div
        className={`px-[18px] pt-3.5 pb-4 ${redeemed ? "bg-line text-muted" : tape ? "" : "bg-accent text-surface"}`}
        style={!redeemed && tape ? { background: tape.bg, color: tape.fg } : undefined}
      >
        <p className="m-0 text-meta font-bold tracking-wide opacity-90">★ 大滿貫兌換卡・原岩攀岩館</p>
        <p className="m-0 flex items-baseline gap-2.5">
          <b className="font-num text-[64px] leading-none font-bold">{g}</b>
          <span className="text-sheet font-black">大滿貫</span>
        </p>
        <p className="m-0 mt-1 text-meta opacity-90">
          全原岩 {total} 條 {g} 全部完成・{achievedOn}
        </p>
      </div>
      <LiveStripe grade={grade} stopped={!!redeemed} />
      <div className="grid justify-items-center gap-2 px-[18px] pt-4 pb-3">
        <div className="relative w-[200px] max-w-full">
          <QrCode value={qr} label={`兌換碼 ${code} 的 QR code`} className={`w-full p-2.5 ${redeemed ? "opacity-15" : ""}`} />
          {redeemed && (
            <p className="absolute top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 -rotate-6 rounded-btn border-[3px] border-accent bg-surface px-3.5 py-1 text-center text-sheet leading-tight font-black whitespace-nowrap text-accent">
              已兌換
              <small className="block text-tiny font-medium">
                {redeemed.when} {redeemed.gym}
              </small>
            </p>
          )}
        </div>
        <p className="m-0 text-center leading-tight">
          <span className="block text-tiny text-muted">兌換碼</span>
          <b className={`font-num text-num-card font-bold tracking-[.08em] ${redeemed ? "text-muted line-through" : ""}`}>{code}</b>
        </p>
        {!redeemed && <LiveClock />}
      </div>
      <div className="relative mx-3.5 border-t-2 border-dashed border-line before:absolute before:-top-[11px] before:-left-6 before:size-5 before:rounded-full before:bg-bg after:absolute after:-top-[11px] after:-right-6 after:size-5 after:rounded-full after:bg-bg" />
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 px-[18px] pt-3 text-note">
        <Row k="暱稱">{nickname}</Row>
        <Row k="獎品">{prize ?? "洽櫃檯"}</Row>
        {redeemed ? <Row k="兌換">{`${redeemed.when}・${redeemed.gym}`}</Row> : <Row k="期限">{expires} 前</Row>}
      </dl>
      <p className="m-0 px-[18px] pt-2 pb-4 text-meta text-muted">{redeemed ? "這張已經兌換過了。" : "到任一館櫃檯，給員工掃 QR code。每組碼只能用一次。"}</p>
    </section>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="m-0 font-medium">{children}</dd>
    </>
  );
}

// 牆上進度那一行右邊的兌換膠囊（Flash 黃）；已兌換是淡色字
export function SlamRedeemTag({ redeemed }: { redeemed: boolean }) {
  return redeemed ? (
    <span className="text-meta leading-none font-bold whitespace-nowrap text-muted">
      <span className="text-flash">★</span> 已兌換
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-flash px-2 py-0.5 text-tiny leading-normal font-bold whitespace-nowrap text-flash-ink">
      ★ 兌換 ›
    </span>
  );
}
