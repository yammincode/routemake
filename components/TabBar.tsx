"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { canOps, isStaff } from "@/lib/auth";
import { DEFAULT_GYM_PATH, lastGymPath } from "@/lib/gyms";

// 底部分頁（原型 .tabs）：館內路線、人物卡、我的紀錄；管理後台只有員工（定線長、店長、老闆）看得到；
// 營運（使用狀況、換線日）只有老闆和老闆授權的人看得到（直接打網址進去一樣由頁面與資料庫權限把關）
const TABS = [
  { href: "gym", label: "館內路線", match: (p: string) => p.startsWith("/zone") || p.startsWith("/gym") || p.startsWith("/spray") },
  { href: "/card", label: "人物卡", match: (p: string) => p.startsWith("/card") },
  { href: "/me", label: "我的紀錄", match: (p: string) => p.startsWith("/me") || p.startsWith("/feedback") },
  { href: "/admin", label: "管理後台", match: (p: string) => p.startsWith("/admin") },
  { href: "/ops", label: "營運", match: (p: string) => p.startsWith("/ops") },
];

export default function TabBar() {
  const pathname = usePathname();
  const { access } = useAuth();
  const show = (href: string) => (href === "/admin" ? isStaff(access) : href === "/ops" ? canOps(access) : true);
  // 館內路線 → 上次選的館
  const [gymHref, setGymHref] = useState(DEFAULT_GYM_PATH);
  useEffect(() => {
    const h = lastGymPath();
    if (h !== gymHref) queueMicrotask(() => setGymHref(h));
  }, [pathname, gymHref]);
  // 入口頁不顯示分頁列
  if (pathname === "/") return null;
  const tabs = TABS.filter((t) => show(t.href));
  // 五個分頁（老闆）：間距縮小，360 寬的手機上四個字的分頁名稱也排得下一行
  const many = tabs.length >= 5;
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-10 flex justify-center border-t border-line bg-surface/92 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] backdrop-blur-[10px] ${many ? "gap-0.5 px-1.5" : "gap-1 px-3"}`}
    >
      {tabs.map((t) => {
        const current = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href === "gym" ? gymHref : t.href}
            aria-current={current ? "page" : undefined}
            className={`max-w-[180px] flex-1 rounded-btn py-2 text-center text-sub whitespace-nowrap ${many ? "px-0.5" : "px-1"} ${current ? "bg-bg font-bold text-ink" : "font-medium text-muted"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
