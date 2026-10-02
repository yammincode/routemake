"use client";

import { useEffect, useRef, type ReactNode } from "react";

// 固定高度、框內上下滑動的清單（一次約看到 4–5 列），整頁不會越拉越長；
// 滑到底自動呼叫 onMore 載入下一批（載入中不會重複呼叫）
export function ScrollList({ children, more = false, onMore }: { children: ReactNode; more?: boolean; onMore?: () => void | Promise<void> }) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const cb = useRef(onMore);
  const busy = useRef(false);
  useEffect(() => {
    cb.current = onMore;
  }, [onMore]);

  useEffect(() => {
    if (!more || !box.current || !end.current) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting) || busy.current || !cb.current) return;
        busy.current = true;
        void Promise.resolve(cb.current()).finally(() => (busy.current = false));
      },
      { root: box.current, rootMargin: "120px" }
    );
    io.observe(end.current);
    return () => io.disconnect();
  }, [more, children]);

  return (
    <div ref={box} data-scroll-list className="-mx-1 max-h-[min(480px,62svh)] overflow-y-auto overscroll-contain px-1 py-1">
      <ul className="m-0 grid list-none gap-2.5 p-0">{children}</ul>
      {more && (
        <div ref={end} className="py-3 text-center text-meta text-muted">
          載入更多…
        </div>
      )}
    </div>
  );
}
