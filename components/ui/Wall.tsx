"use client";

import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { gradeShort, holdTextColor, HOLD_COLORS, type HoldColor, type Status } from "@/lib/design";
import { imgFallback } from "./Gym";

// 起步點標記（原型 .pin）：顏色＝岩點色、數字＝難度（V 級數字或 YDS 去掉 5.）；完攀加酒紅外圈，Flash 黃圈；不符合篩選時變淡
export function Pin({
  x,
  y,
  color,
  grade,
  status,
  dim = false,
  label,
  onClick,
}: {
  x: number;
  y: number;
  color: HoldColor;
  grade: number;
  status?: Status | null;
  dim?: boolean;
  label: string;
  onClick?: (e: MouseEvent) => void;
}) {
  const ring = status === "flash" ? "shadow-[0_0_0_2px_var(--flash)]" : status === "send" ? "shadow-[0_0_0_2px_var(--accent)]" : null;
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`absolute grid size-[30px] place-items-center rounded-full border-2 border-white font-num text-num-pin font-bold shadow-pin transition-opacity duration-150 ${dim ? "opacity-[0.16]" : ""}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%) scale(var(--inv, 1))",
        background: HOLD_COLORS[color],
        color: holdTextColor(color),
      }}
    >
      <span className={grade >= 100 ? "text-[12px] tracking-[-0.03em]" : undefined}>{gradeShort(grade)}</span>
      {ring && <span aria-hidden className={`pointer-events-none absolute -inset-1.5 rounded-full border-2 border-white ${ring}`} />}
    </button>
  );
}

// 管理後台點照片時先出現的「＋」暫時標記
export function TempPin({ x, y }: { x: number; y: number }) {
  return (
    <span
      className="absolute grid size-[30px] animate-pop place-items-center rounded-full border-2 border-white bg-ink font-num text-num-pin font-bold text-surface shadow-pin"
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%) scale(var(--inv, 1))" }}
    >
      ＋
    </span>
  );
}

// 區域照片＋標記：可雙指放大（1–4 倍）、放大後單指拖曳、點兩下還原；標記大小不跟著放大
// setter=true 時顯示虛線框，點空白處回傳百分比座標（放大時一樣準）
// hideable=true 時左上角有「隱藏路線」按鈕，按了標記淡出、點不到，只看岩牆（不記住，重新進來會顯示）
// 放左上角：起步點多在照片下半部，右上角是放大時的「還原」
export function WallPhoto({
  src,
  alt,
  setter = false,
  hideable = false,
  onPick,
  children,
}: {
  src: string;
  alt: string;
  setter?: boolean;
  hideable?: boolean;
  onPick?: (x: number, y: number) => void;
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [hidden, setHidden] = useState(false);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ s: number; x: number; y: number; d: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef(0);

  // 讓照片不會被拖出框外
  const clamp = (s: number, x: number, y: number) => {
    const b = box.current?.getBoundingClientRect();
    if (!b) return { s, x, y };
    return { s, x: Math.min(0, Math.max(b.width * (1 - s), x)), y: Math.min(0, Math.max(b.height * (1 - s), y)) };
  };

  const snapshot = () => {
    const [a, b] = [...pts.current.values()];
    const box0 = box.current!.getBoundingClientRect();
    const cx = (b ? (a.x + b.x) / 2 : a.x) - box0.left;
    const cy = (b ? (a.y + b.y) / 2 : a.y) - box0.top;
    start.current = { ...view, d: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0, cx, cy };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 1) moved.current = false;
    snapshot();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pts.current.has(e.pointerId) || !start.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = start.current;
    const [a, b] = [...pts.current.values()];
    const b0 = box.current!.getBoundingClientRect();
    if (b && st.d) {
      moved.current = true;
      const s = Math.min(4, Math.max(1, (st.s * Math.hypot(a.x - b.x, a.y - b.y)) / st.d));
      const cx = (a.x + b.x) / 2 - b0.left;
      const cy = (a.y + b.y) / 2 - b0.top;
      // 以兩指中心為基準縮放
      const px = (st.cx - st.x) / st.s;
      const py = (st.cy - st.y) / st.s;
      setView(clamp(s, cx - px * s, cy - py * s));
    } else if (!b && st.s > 1) {
      const dx = a.x - b0.left - st.cx;
      const dy = a.y - b0.top - st.cy;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true;
      setView(clamp(st.s, st.x + dx, st.y + dy));
    }
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size) snapshot();
    else start.current = null;
  };

  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (moved.current) {
      moved.current = false;
      return;
    }
    // 點兩下還原
    const now = Date.now();
    if (view.s > 1 && now - lastTap.current < 300 && !(e.target as HTMLElement).closest("button")) {
      lastTap.current = 0;
      setView({ s: 1, x: 0, y: 0 });
      return;
    }
    lastTap.current = now;
    if (!setter || !onPick || (e.target as HTMLElement).closest("button")) return;
    const b = inner.current!.getBoundingClientRect();
    onPick(((e.clientX - b.left) / b.width) * 100, ((e.clientY - b.top) / b.height) * 100);
  };

  const zoomed = view.s > 1;
  return (
    <div
      ref={box}
      onClick={click}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: zoomed ? "none" : "pan-y" }}
      className={`relative mb-3.5 overflow-hidden rounded-tile bg-line shadow-card ${setter ? "cursor-crosshair outline-2 -outline-offset-2 outline-accent outline-dashed" : ""}`}
    >
      <div
        ref={inner}
        className="origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, ["--inv" as string]: 1 / view.s }}
      >
        {/* key={src}：換照片時換一個新的元素（退回一般方式顯示過的元素不會再帶 crossOrigin） */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt={alt} crossOrigin="anonymous" draggable={false} onError={(e) => imgFallback(e.currentTarget)} className="block h-auto w-full select-none" />
        <div className={`absolute inset-0 transition-[opacity,visibility] duration-150 ${hideable && hidden ? "invisible opacity-0" : ""}`}>{children}</div>
      </div>
      {zoomed && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setView({ s: 1, x: 0, y: 0 });
          }}
          className="absolute top-2 right-2 rounded-full bg-ink/80 px-3 py-1 text-meta font-bold text-surface"
        >
          還原
        </button>
      )}
      {hideable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setHidden((h) => !h);
          }}
          className="absolute top-2 left-2 rounded-full bg-ink/80 px-3 py-1 text-meta font-bold text-surface"
        >
          {hidden ? "顯示路線" : "隱藏路線"}
        </button>
      )}
    </div>
  );
}

// 區域還沒有照片時的佔位框（同岩牆照片比例 4:3）
export function NoPhoto({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 grid aspect-[4/3] place-items-center rounded-tile bg-sunk p-6 text-center text-sub text-muted shadow-card">
      <span>{children}</span>
    </div>
  );
}
