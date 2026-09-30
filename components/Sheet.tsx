"use client";

import { useEffect, type ReactNode } from "react";

// 底部彈出面板，樣式沿用原型的 .sheet
export default function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        className="animate-sheet max-h-[90vh] w-full max-w-[560px] overflow-y-auto rounded-t-[22px] bg-surface px-5 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] before:mx-auto before:mb-3.5 before:block before:h-1 before:w-10 before:rounded-sm before:bg-line"
      >
        {children}
      </div>
    </div>
  );
}
