"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DEFAULT_GYM_PATH, lastGymPath } from "@/lib/gyms";

// 底部分頁（原型 .tabs）：館內路線、人物卡、我的紀錄；管理後台只有員工（定線長、店長、老闆）看得到
// （直接打網址進後台一樣由 StaffGate 與資料庫權限把關）
const TABS = [
  { href: "gym", label: "館內路線", match: (p: string) => p.startsWith("/zone") || p.startsWith("/gym") || p.startsWith("/spray") },
  { href: "/card", label: "人物卡", match: (p: string) => p.startsWith("/card") },
  { href: "/me", label: "我的紀錄", match: (p: string) => p.startsWith("/me") || p.startsWith("/feedback") },
  { href: "/admin", label: "管理後台", match: (p: string) => p.startsWith("/admin") },
];

export default function TabBar() {
  const pathname = usePathname();
  const { access } = useAuth();
  const isStaff = !!access && (access.is_owner || access.roles.length > 0);
  // 館內路線 → 上次選的館
  const [gymHref, setGymHref] = useState(DEFAULT_GYM_PATH);
  useEffect(() => {
    const h = lastGymPath();
    if (h !== gymHref) queueMicrotask(() => setGymHref(h));
  }, [pathname, gymHref]);
  // 入口頁不顯示分頁列
  if (pathname === "/") return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-center gap-1 border-t border-line bg-surface/92 px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] backdrop-blur-[10px]">
      {TABS.filter((t) => t.href !== "/admin" || isStaff).map((t) => {
        const current = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href === "gym" ? gymHref : t.href}
            aria-current={current ? "page" : undefined}
            className={`max-w-[180px] flex-1 rounded-btn px-1 py-2 text-center text-sub ${current ? "bg-bg font-bold text-ink" : "font-medium text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
