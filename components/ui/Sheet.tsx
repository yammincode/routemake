"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 底部彈出面板（原型 .sheet）；點背景或按 Esc 關閉
// 直接放到 body 底下，面板裡再開面板（例如路線卡片裡點名字看人物卡）也會蓋住整個畫面
export default function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/[0.42]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-page animate-sheet overflow-y-auto rounded-t-sheet bg-surface px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] before:mx-auto before:mb-3.5 before:block before:h-1 before:w-10 before:rounded-sm before:bg-line"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

// 面板標題與說明
export function SheetTitle({ children }: { children: ReactNode }) {
  return <h2 className="m-0 flex items-center gap-3 text-sheet font-bold">{children}</h2>;
}
export function SheetSub({ children }: { children: ReactNode }) {
  return <p className="mt-1 mb-3 text-note text-muted">{children}</p>;
}

// 面板內的分段（上方細線）
export function SheetSection({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-1">
      <h4 className="mt-3.5 mb-2.5 flex items-center justify-between text-sub font-bold">
        {title}
        {aside != null && <small className="text-meta font-normal text-muted">{aside}</small>}
      </h4>
      {children}
    </div>
  );
}
