"use client";

import type { useRouter } from "next/navigation";

// 畫面上的「‹ 返回」跟手機的上一頁一樣：有上一頁就退回去，直接從連結打開（沒有上一頁）才跳到指定頁面
export function backOr(router: ReturnType<typeof useRouter>, fallback: string) {
  if (typeof window !== "undefined" && window.history.length > 1) router.back();
  else router.push(fallback);
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
