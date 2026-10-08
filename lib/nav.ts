"use client";

import type { useRouter } from "next/navigation";

// 畫面上的「‹ 返回」跟手機的上一頁一樣：有上一頁就退回去，直接從連結打開（沒有上一頁）才跳到指定頁面
export function backOr(router: ReturnType<typeof useRouter>, fallback: string) {
  if (typeof window !== "undefined" && window.history.length > 1) router.back();
  else router.push(fallback);
}

// 有名字的返回（「‹ 選擇攀岩館」「‹ 明德館」）：一定要到那一頁
// 上一頁剛好就是那一頁才退回去（跟手機上一頁一樣，不會越疊越多）；其他情況（從我的紀錄、換館、登入回來）直接開那一頁
// 用瀏覽器的 Navigation API 看上一頁是哪裡；舊手機沒有這個 API 就直接開
export function upTo(router: ReturnType<typeof useRouter>, target: string) {
  let prevPath: string | null = null;
  try {
    const nav = (window as { navigation?: NavLike }).navigation;
    const i = nav?.currentEntry?.index ?? -1;
    const url = i > 0 ? nav?.entries()[i - 1]?.url : null;
    if (url) {
      const u = new URL(url);
      if (u.origin === window.location.origin) prevPath = u.pathname + u.search;
    }
  } catch {}
  if (prevPath === target) router.back();
  else router.push(target);
}
type NavLike = { currentEntry: { index: number } | null; entries(): { url: string | null }[] };

// 目前頁面的網址（含 ?id= 這類參數），給「登入後回到這頁」用；區域頁 /zone?id=… 少了參數會找不到區域
export function herePath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
}

// 只允許站內路徑（擋掉 //evil.com、/\evil.com、https://… 這類會跳到別的網站的網址）
export function safeInternalPath(n: string | null | undefined, fallback: string): string {
  if (!n || !n.startsWith("/") || n.includes("\\")) return fallback;
  try {
    const base = "https://routemake.invalid";
    const u = new URL(n, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
