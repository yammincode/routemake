"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { isStaffOf } from "@/lib/auth";
import { DEFAULT_GYM_PATH, lastGymPath } from "@/lib/gyms";

// 底部分頁（原型 .tabs）；管理後台只有員工看得到
const TABS = [
  { href: "gym", label: "館內路線", match: (p: string) => p.startsWith("/zone") || p.startsWith("/gym") },
  { href: "/me", label: "我的紀錄", match: (p: string) => p.startsWith("/me") },
  { href: "/admin", label: "管理後台", match: (p: string) => p.startsWith("/admin"), staff: true },
];

export default function TabBar() {
  const pathname = usePathname();
  const { access } = useAuth();
  const staff = isStaffOf(access);
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
      {TABS.filter((t) => !t.staff || staff).map((t) => {
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
