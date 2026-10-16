"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// 底部彈出面板（原型 .sheet）；點背景或按 Esc 關閉
// 直接放到 body 底下，面板裡再開面板（例如路線卡片裡點名字看人物卡）也會蓋住整個畫面
// full：蓋滿整個畫面（路線卡片，使用者選的 3B）：左上「‹」關閉；bare：最上面不留空（內容自己放滿版的照片，用 -mx-5 貼齊兩邊）；
//   打開時多一筆瀏覽紀錄，手機返回鍵（滑回上一頁）只關掉卡片、不離開這一頁
// 全螢幕卡片剛關掉、還沒退掉的那一筆瀏覽紀錄
let leaving: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;

export default function Sheet({
  open,
  onClose,
  full = false,
  bare = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  full?: boolean;
  bare?: boolean;
  children: ReactNode;
}) {
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

  // 全螢幕：返回鍵關卡片。打開時記一筆（網址不變）；按返回 → 關掉；用 ‹、Esc 關掉 → 把那一筆退掉
  // 卡片裡點連結換頁時（網址變了、那一筆已經不在最上面）不退，免得把剛換的頁面退回去
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open || !full) return;
    const href = location.href;
    let id: string;
    // 剛關掉又馬上打開（開發模式 React 會這樣檢查）：沿用還沒退掉的那一筆，不多記一筆
    if (leaving && history.state?.sheet === leaving.id) {
      clearTimeout(leaving.timer);
      id = leaving.id;
      leaving = null;
    } else {
      id = Math.random().toString(36).slice(2);
      history.pushState({ ...(history.state ?? {}), sheet: id }, "", href);
    }
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (popped) return;
      const undo = () => {
        leaving = null;
        if (history.state?.sheet === id && location.href === href) history.back();
      };
      // 正式版關掉就馬上退（晚一點退的話，剛好接著換頁會被這一下退回去）；
      // 開發模式 React 會關掉再馬上打開一次檢查，晚一點退才能沿用同一筆
      if (process.env.NODE_ENV === "production") undo();
      else leaving = { id, timer: setTimeout(undo, 0) };
    };
  }, [open, full]);

  if (!open) return null;
  if (full)
    return createPortal(
      <div className="fixed inset-0 z-20 flex justify-center bg-black/[0.42]">
        <div role="dialog" aria-modal="true" className="relative h-full w-full max-w-page animate-sheet overflow-y-auto bg-surface pb-[calc(20px+env(safe-area-inset-bottom,0px))]">
          <div className="sticky top-0 z-10 h-0">
            <button
              type="button"
              aria-label="關閉"
              onClick={onClose}
              className="absolute top-[calc(10px+env(safe-area-inset-top,0px))] left-3 grid size-9 place-items-center rounded-full bg-ink/70 text-[22px] leading-none font-bold text-surface shadow-card"
            >
              ‹
            </button>
          </div>
          {!bare && <div className="h-[calc(56px+env(safe-area-inset-top,0px))]" />}
          <div className="px-5">{children}</div>
        </div>
      </div>,
      document.body
    );
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
