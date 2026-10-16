import type { ReactNode } from "react";
import { Grade } from "./Route";

// 使用狀況「本週重點」卡片：左邊大數字、中間一句話＋說明，點了跳到那一段
export function HighlightCard({ big, title, detail, onClick }: { big: string; title: string; detail: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-tile bg-surface px-3.5 py-3 text-left shadow-card">
      <b className="min-w-[2.6em] flex-none font-num text-num-card text-accent">{big}</b>
      <span className="min-w-0 flex-1">
        <span className="block text-sub font-bold">{title}</span>
        <span className="block text-meta text-muted">{detail}</span>
      </span>
      <span aria-hidden className="flex-none text-[22px] text-muted">
        ›
      </span>
    </button>
  );
}

// 一行橫條：左邊名稱、中間長條（0–100）、右邊數字；muted＝灰色長條（比較用的那一條）
export function MeterRow({ label, value, right, muted = false }: { label: ReactNode; value: number; right: ReactNode; muted?: boolean }) {
  return (
    <li className="grid grid-cols-[minmax(64px,auto)_1fr_auto] items-center gap-2.5 text-note">
      <span className="truncate">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-sunk">
        <span className={`block h-full rounded-full ${muted ? "bg-muted/60" : "bg-accent"}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      <span className="text-right text-muted">{right}</span>
    </li>
  );
}

export function MeterList({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-none gap-2 p-0">{children}</ul>;
}

// 分段長條（常客分群這類加起來是全部的）：深→淺三種主色，下面圖例寫人數
const SPLIT = ["bg-accent", "bg-accent/45", "bg-line"];
export function SplitBar({ parts, label }: { parts: { label: string; n: number }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  return (
    <div>
      <div role="img" aria-label={`${label}：${parts.map((p) => `${p.label} ${p.n} 人`).join("、")}`} className="flex h-5 overflow-hidden rounded-full bg-sunk">
        {total > 0 && parts.map((p, i) => <span key={p.label} className={SPLIT[i % SPLIT.length]} style={{ width: `${(p.n / total) * 100}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-muted">
        {parts.map((p, i) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-[3px] ${SPLIT[i % SPLIT.length]}`} />
            {p.label} <b className="font-num text-ink">{p.n}</b> 人
          </span>
        ))}
      </div>
    </div>
  );
}

// 路線標記：可能太難（主色淡底）、可能太簡單（黃底）、冷門／體感（灰底）
const PILL = { hard: "bg-accent-soft text-accent", easy: "bg-flash text-flash-ink", plain: "bg-sunk text-muted" } as const;
export function InsightPill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-tiny font-bold whitespace-nowrap ${PILL[tone]}`}>{children}</span>;
}

// 路線分析的一行（不能點）：難度、名稱和數字、右邊標記；跟使用狀況「熱門路線」同一個樣子
export function InsightRouteRow({ grade, title, meta, right }: { grade: number; title: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-btn bg-surface px-3 py-2 shadow-card">
      <Grade grade={grade} className="text-num-bar w-[52px]" />
      <span className="min-w-0 flex-1 text-meta text-muted">
        <span className="block truncate text-note text-ink">{title}</span>
        {meta}
      </span>
      {right && <span className="flex flex-none flex-col items-end gap-1">{right}</span>}
    </li>
  );
}
