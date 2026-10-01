"use client";

import { useState, type PointerEvent } from "react";

// 可以拖曳排序的清單：按住右邊「≡」上下拖，或用 ↑ ↓ 一格一格移（每列固定高度，方便算位置）
const ROW = 56; // 列高 48px＋間距 8px

export function SortList({ items, onChange }: { items: { id: string; label: string; sub?: string }[]; onChange: (ids: string[]) => void }) {
  const [drag, setDrag] = useState<{ id: string; y0: number; i0: number; dy: number } | null>(null);
  const ids = items.map((i) => i.id);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };

  const down = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, y0: e.clientY, i0: ids.indexOf(id), dy: 0 });
  };
  const moveTo = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    const cur = ids.indexOf(drag.id);
    const want = Math.max(0, Math.min(ids.length - 1, drag.i0 + Math.round(dy / ROW)));
    if (want !== cur) move(cur, want);
    setDrag({ ...drag, dy });
  };
  const up = () => setDrag(null);

  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {items.map((it, i) => {
        const dragging = drag?.id === it.id;
        const offset = dragging ? drag.dy - (i - drag.i0) * ROW : 0;
        return (
          <li
            key={it.id}
            style={dragging ? { transform: `translateY(${offset}px)` } : undefined}
            className={`flex h-12 items-center gap-1 rounded-field border border-line bg-sunk pl-3 ${dragging ? "relative z-10 shadow-card" : ""}`}
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {it.label}
              {it.sub && <small className="ml-1.5 text-meta text-muted">{it.sub}</small>}
            </span>
            <button aria-label={`${it.label} 往上`} disabled={i === 0} onClick={() => move(i, i - 1)} className="size-10 text-muted disabled:opacity-30">
              ↑
            </button>
            <button aria-label={`${it.label} 往下`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)} className="size-10 text-muted disabled:opacity-30">
              ↓
            </button>
            <button
              aria-label={`拖曳 ${it.label}`}
              onPointerDown={(e) => down(e, it.id)}
              onPointerMove={moveTo}
              onPointerUp={up}
              onPointerCancel={up}
              className="h-12 w-11 flex-none cursor-grab touch-none text-[20px] text-muted active:cursor-grabbing"
            >
              ≡
            </button>
          </li>
        );
      })}
    </ul>
  );
}
