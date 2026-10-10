"use client";

import type { ReactNode } from "react";

// 長耐力路線照順序標的點：細圈圈＋號碼；第 1 點綠（起攀色）、最後一點紅（完攀色）、中間藍
// 放在 WallPhoto 裡跟著照片放大縮小，但圈的線和號碼維持原本粗細大小（看得到後面的岩點）
// reached：顧客爬到第幾點（之後的點變淡）；onTap：編輯時點圈圈刪掉那一點（後面的號碼往前補）
export function NumberMarks({ holds, reached, onTap }: { holds: { x: number; y: number }[]; reached?: number | null; onTap?: (i: number) => void }) {
  return (
    <>
      {holds.map((p, i) => {
        const n = i + 1;
        const color = n === 1 ? "var(--hold-start)" : n === holds.length ? "var(--hold-top)" : "var(--hold-mid)";
        const style = {
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: "3.2%",
          borderColor: color,
          borderWidth: "calc(1.5px * var(--inv, 1))",
          transform: "translate(-50%, -50%)",
          boxShadow: "0 0 0 calc(1px * var(--inv, 1)) rgba(255,255,255,.8)",
          opacity: reached != null && n > reached ? 0.35 : 1,
        };
        const label = (
          <span
            className="absolute bottom-[70%] left-[70%] origin-bottom-left rounded-full px-[3px] font-num text-[9px] leading-[12px] font-bold text-white"
            style={{ background: color, transform: "scale(var(--inv, 1))" }}
          >
            {n}
          </span>
        );
        return onTap ? (
          <button key={i} aria-label={`第 ${n} 點（點一下刪除）`} onClick={() => onTap(i)} className="absolute aspect-square rounded-full border-solid" style={style}>
            {label}
          </button>
        ) : (
          <span key={i} aria-hidden className="pointer-events-none absolute aspect-square rounded-full border-solid" style={style}>
            {label}
          </span>
        );
      })}
    </>
  );
}

// 最高爬到第幾點：－／拉桿／＋，下面大字「30 ／ 38 點」，aside 放分數等說明；value null＝還沒填
export function HighpointPicker({
  value,
  total,
  onChange,
  aside,
  disabled = false,
}: {
  value: number | null;
  total: number;
  onChange: (v: number) => void;
  aside?: ReactNode;
  disabled?: boolean;
}) {
  const max = Math.max(1, total - 1); // 爬到最後一點就是完攀，這裡最多到倒數第 2 點
  const v = value ?? 0;
  const set = (n: number) => onChange(Math.min(max, Math.max(1, n)));
  return (
    <div className="mt-2 rounded-tile bg-surface px-4 pt-3 pb-3.5 shadow-card">
      <label htmlFor="highpoint" className="block text-meta text-muted">
        最高爬到第幾點
      </label>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          aria-label="少一點"
          disabled={disabled || v <= 1}
          onClick={() => set(v - 1)}
          className="grid size-10 flex-none place-items-center rounded-full border border-line text-[20px] disabled:opacity-40"
        >
          −
        </button>
        <input
          id="highpoint"
          type="range"
          min={1}
          max={max}
          value={value ?? 1}
          disabled={disabled}
          onChange={(e) => set(+e.target.value)}
          className="min-w-0 flex-1 accent-[var(--accent)]"
        />
        <button
          aria-label="多一點"
          disabled={disabled || v >= max}
          onClick={() => set(v + 1)}
          className="grid size-10 flex-none place-items-center rounded-full border border-line text-[20px] disabled:opacity-40"
        >
          ＋
        </button>
      </div>
      <p className="mt-2 mb-0 text-center">
        {value == null ? (
          <span className="text-meta text-muted">拉一下記錄最高爬到第幾點</span>
        ) : (
          <>
            <b className="font-num text-[28px]">{value}</b>
            <span className="text-muted"> ／ {total} 點</span>
          </>
        )}
        {aside && <span className="ml-2 text-meta text-muted">{aside}</span>}
      </p>
    </div>
  );
}
