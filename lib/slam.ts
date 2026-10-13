// 大滿貫兌換：兌換碼顯示、QR code 網址、要不要顯示兌換按鈕
import type { SlamClaim, SlamInfo } from "@/lib/data";
import { isGrandSlam, type ProgressRow } from "@/lib/progress";

// 兌換碼 8 碼，中間加一槓比較好念：K7Q4-82MD
export const showCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
// 手打的碼：去掉空白、槓，轉大寫
export const normCode = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();
// QR code 裡放員工兌換頁的網址（只有碼，沒有暱稱等個資）；員工用手機相機掃就打開
export const redeemUrl = (origin: string, code: string) => `${origin}/redeem?c=${code}`;
export const slamPath = (grade: number) => `/slam?g=${grade}`;

// 這個難度最新的一組碼（兌換過的優先）
export const claimOf = (info: SlamInfo | null, grade: number): SlamClaim | null => info?.claims.find((c) => c.grade === grade) ?? null;

// 牆上進度這一行要不要放兌換：大滿貫、活動開著（老闆可以先試）、牆上至少 min_routes 條；兌換過的寫「已兌換」
export type SlamAction = "claim" | "redeemed";
export function slamAction(info: SlamInfo | null, isOwner: boolean, r: ProgressRow): SlamAction | null {
  if (!info || !isGrandSlam(r)) return null;
  // 兌換過的難度：換線後新路線上牆就照一般的「完成/總數」，重新集滿才寫已兌換
  if (claimOf(info, r.grade)?.redeemed_at) return "redeemed";
  if (!info.enabled && !isOwner) return null;
  return r.total >= info.min_routes ? "claim" : null;
}

// 期限、兌換時間（台北時間）：2026/11/12 或 10/14 19:42
const TZ = "Asia/Taipei";
export const slamDate = (iso: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
export const slamTime = (iso: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.month}/${p.day} ${p.hour}:${p.minute}`;
};
export const ymdSlash = (ymd: string) => ymd.replaceAll("-", "/");
