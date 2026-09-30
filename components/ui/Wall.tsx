"use client";

import type { MouseEvent, ReactNode } from "react";
import { holdTextColor, HOLD_COLORS, type HoldColor, type Status } from "@/lib/design";

// 起步點標記（原型 .pin）：顏色＝岩點色、數字＝V 級；完攀加酒紅外圈，Flash 黃圈；不符合篩選時變淡
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
      className={`absolute grid size-[30px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-num text-num-pin font-bold shadow-pin transition-opacity duration-150 ${dim ? "opacity-[0.16]" : ""}`}
      style={{ left: `${x}%`, top: `${y}%`, background: HOLD_COLORS[color], color: holdTextColor(color) }}
    >
      {grade}
      {ring && <span aria-hidden className={`pointer-events-none absolute -inset-1.5 rounded-full border-2 border-white ${ring}`} />}
    </button>
  );
}

// 管理後台點照片時先出現的「＋」暫時標記
export function TempPin({ x, y }: { x: number; y: number }) {
  return (
    <span
      className="absolute grid size-[30px] -translate-x-1/2 -translate-y-1/2 animate-pop place-items-center rounded-full border-2 border-white bg-ink font-num text-num-pin font-bold text-surface shadow-pin"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      ＋
    </span>
  );
}

// 區域照片＋標記；setter=true 時顯示虛線框，點空白處回傳百分比座標
export function WallPhoto({
  src,
  alt,
  setter = false,
  onPick,
  children,
}: {
  src: string;
  alt: string;
  setter?: boolean;
  onPick?: (x: number, y: number) => void;
  children?: ReactNode;
}) {
  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (!setter || !onPick || (e.target as HTMLElement).closest("button")) return;
    const b = e.currentTarget.getBoundingClientRect();
    onPick(((e.clientX - b.left) / b.width) * 100, ((e.clientY - b.top) / b.height) * 100);
  };
  return (
    <div
      onClick={click}
      className={`relative mb-3.5 touch-manipulation overflow-hidden rounded-tile bg-line shadow-card ${setter ? "cursor-crosshair outline-2 -outline-offset-2 outline-accent outline-dashed" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="block h-auto w-full select-none" />
      {children}
    </div>
  );
}
