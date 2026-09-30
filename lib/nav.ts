"use client";

import type { useRouter } from "next/navigation";

// 畫面上的「‹ 返回」跟手機的上一頁一樣：有上一頁就退回去，直接從連結打開（沒有上一頁）才跳到指定頁面
export function backOr(router: ReturnType<typeof useRouter>, fallback: string) {
  if (typeof window !== "undefined" && window.history.length > 1) router.back();
  else router.push(fallback);
}
