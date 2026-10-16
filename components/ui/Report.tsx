import type { ComponentProps, ReactNode } from "react";
import { HOLD_COLORS, holdTextColor, type HoldColor } from "@/lib/design";

// 路線回報（step47）的共用元件

// 回報入口：區域頁最下面、路線卡片分頁下面的一行文字連結（不搶版面）
export function ReportLink({ children, className = "", ...rest }: ComponentProps<"button">) {
  return (
    <button className={`mt-4 block w-full py-2.5 text-center text-note text-muted underline-offset-2 hover:underline ${className}`} {...rest}>
      {children} <span className="text-accent">›</span>
    </button>
  );
}

// 客人回報時，在照片上點的位置：虛線圈＋「?」（跟路線的實心圓點分得出來）
export function ReportSpot({ x, y, color }: { x: number; y: number; color?: HoldColor | null }) {
  return (
    <span
      data-testid="report-spot"
      className="pointer-events-none absolute grid size-[30px] animate-pop place-items-center rounded-full border-2 border-dashed border-white font-num text-num-pin font-bold shadow-pin"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%) scale(var(--inv, 1))",
        background: color ? HOLD_COLORS[color] : "var(--ink)",
        color: color ? holdTextColor(color) : "var(--surface)",
      }}
    >
      ?
    </span>
  );
}

// 後台照片上的回報標記：虛線圈、數字是幾個人回報；點了選這一則（選中的加 Flash 黃框）
export function ReportMark({
  x,
  y,
  color,
  count,
  selected = false,
  label,
  onClick,
}: {
  x: number;
  y: number;
  color?: HoldColor | null;
  count: number;
  selected?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`absolute grid size-[30px] place-items-center rounded-full border-2 border-dashed border-white font-num text-num-pin font-bold shadow-pin ${selected ? "z-10 outline-3 outline-offset-2 outline-flash" : ""}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%) scale(var(--inv, 1))",
        background: color ? HOLD_COLORS[color] : "var(--ink)",
        color: color ? holdTextColor(color) : "var(--surface)",
      }}
    >
      {count > 1 ? count : "?"}
    </button>
  );
}

// 還沒處理的則數（後台標題旁）
export function ReportCount({ n }: { n: number }) {
  if (!n) return null;
  return <span className="ml-2 rounded-full bg-accent px-2 py-px align-middle font-num text-tiny font-bold text-surface">{n}</span>;
}

// 後台一則回報（同一件事合起來）：標題、幾個人回報、誰說了什麼，下面是處理按鈕
export function ReportItem({
  title,
  meta,
  notes,
  selected = false,
  onSelect,
  actions,
}: {
  title: ReactNode;
  meta: ReactNode;
  notes: { who: string; text: string }[];
  selected?: boolean;
  onSelect?: () => void;
  actions?: ReactNode;
}) {
  return (
    <li className={`grid gap-1.5 bg-surface px-4 py-3 ${selected ? "shadow-[inset_4px_0_0_var(--flash)]" : ""}`}>
      <button className="grid gap-0.5 text-left" onClick={onSelect} aria-pressed={selected}>
        <span className="flex items-center gap-2 text-sub font-bold">{title}</span>
        <span className="text-meta text-muted">{meta}</span>
      </button>
      {notes.map((n, i) => (
        <p key={i} className="m-0 rounded-cell bg-sunk px-2.5 py-1.5 text-note break-words">
          <b className="text-meta text-muted">{n.who}：</b>
          {n.text}
        </p>
      ))}
      {actions && <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{actions}</div>}
    </li>
  );
}

// 處理按鈕（文字連結樣式；main＝主要動作用酒紅粗體）
export function ReportAction({ main = false, className = "", ...rest }: ComponentProps<"button"> & { main?: boolean }) {
  return <button className={`py-1 text-meta disabled:opacity-45 ${main ? "font-bold text-accent" : "text-muted underline"} ${className}`} {...rest} />;
}

export function ReportList({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-none gap-px overflow-hidden rounded-tile bg-line p-0 shadow-card">{children}</ul>;
}
