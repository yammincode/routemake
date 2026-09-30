"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 管理後台分頁：第 3 步做完登入後，改成只有員工看得到
const TABS = [
  { href: "/", label: "館內路線", match: (p: string) => p === "/" || p.startsWith("/zone") || p.startsWith("/gym") },
  { href: "/me", label: "我的紀錄", match: (p: string) => p.startsWith("/me") },
  { href: "/admin", label: "管理後台", match: (p: string) => p.startsWith("/admin") },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-center gap-1 border-t border-line bg-surface/90 px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))] backdrop-blur-md">
      {TABS.map((t) => {
        const current = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={`max-w-[180px] flex-1 rounded-xl px-1 py-2 text-center text-[15px] ${
              current ? "bg-bg font-bold text-ink" : "font-medium text-muted"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
