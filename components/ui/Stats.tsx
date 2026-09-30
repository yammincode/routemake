import type { ReactNode } from "react";

// 月份切換（原型 .month）
export function MonthSwitcher({ year, month, onPrev, onNext, nextDisabled }: { year: number; month: number; onPrev: () => void; onNext: () => void; nextDisabled?: boolean }) {
  const btn = "size-10 rounded-full bg-surface text-[24px] text-muted shadow-card disabled:opacity-30";
  return (
    <div className="mt-1.5 mb-3.5 flex items-center justify-between">
      <button aria-label="上個月" onClick={onPrev} className={btn}>
        ‹
      </button>
      <strong className="text-[20px]">
        {year} 年 {month} 月
      </strong>
      <button aria-label="下個月" onClick={onNext} disabled={nextDisabled} className={btn}>
        ›
      </button>
    </div>
  );
}

// 四格統計（原型 .stats）；flash=true 為黃底
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-4 gap-2">{children}</div>;
}
export function StatTile({ value, label, flash = false }: { value: ReactNode; label: string; flash?: boolean }) {
  return (
    <div className={`rounded-tile px-2.5 py-3 text-meta shadow-card ${flash ? "bg-flash text-flash-ink" : "bg-surface text-muted"}`}>
      <strong className={`mb-1 block font-num text-num-stat font-bold ${flash ? "text-flash-ink" : "text-ink"}`}>{value}</strong>
      {label}
    </div>
  );
}

// 跟上個月比較
export function Delta({ diff }: { diff: number }) {
  return (
    <p className="mt-2.5 mb-0 text-note text-muted">
      {diff > 0 ? (
        <>
          比上個月多 <b className="text-accent">{diff}</b> 條
        </>
      ) : diff < 0 ? (
        `比上個月少 ${-diff} 條`
      ) : (
        "跟上個月一樣"
      )}
    </p>
  );
}

const LEVEL = ["bg-surface text-muted", "bg-accent-soft text-ink", "bg-accent/60 text-ink", "bg-accent text-surface"];
const level = (c: number) => (c >= 5 ? 3 : c >= 3 ? 2 : c >= 1 ? 1 : 0);

// 攀爬日月曆熱度（原型 .cal）；counts[日] = 當天完攀數
export function CalendarHeat({ year, month, counts, today }: { year: number; month: number; counts: Record<number, number>; today?: number }) {
  const first = new Date(year, month - 1, 1).getDay();
  const days = new Date(year, month, 0).getDate();
  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center">
        {"日一二三四五六".split("").map((c) => (
          <span key={c} className="text-tiny text-muted">
            {c}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const c = counts[d] || 0;
          return (
            <span
              key={d}
              aria-label={c ? `${month}/${d} 完攀 ${c} 條` : undefined}
              className={`grid aspect-square place-items-center rounded-cell font-num text-[15px] leading-none font-semibold ${LEVEL[level(c)]} ${d === today ? "shadow-[inset_0_0_0_2px_var(--ink)]" : ""}`}
            >
              {d}
            </span>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-tiny text-muted">
        少
        {LEVEL.slice(1).map((c) => (
          <i key={c} className={`inline-block size-3 rounded-[3px] ${c.split(" ")[0]}`} />
        ))}
        多
      </div>
    </>
  );
}

// 難度長條圖（原型 .gbars）
export function GradeBars({ rows }: { rows: { grade: number; ratio: number; label: string }[] }) {
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <div key={r.grade} className="grid grid-cols-[40px_1fr_56px] items-center gap-2.5">
          <span className="font-num text-num-bar font-bold">V{r.grade}</span>
          <span className="h-3 overflow-hidden rounded-md bg-line">
            <i className="block h-full rounded-md bg-accent" style={{ width: `${r.ratio * 100}%` }} />
          </span>
          <span className="text-right font-num text-num-chip leading-none font-semibold text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

// 累計（原型 .total）
export function TotalRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mt-7 flex items-center justify-between rounded-tile bg-surface px-4 py-3.5 shadow-card">
      <span>{label}</span>
      <strong className="font-num text-num-stat font-bold">{value}</strong>
    </div>
  );
}

// 管理後台設定框（原型 .setbox）
export function SetBox({ children }: { children: ReactNode }) {
  return <div className="mb-3 rounded-card bg-surface px-3.5 pt-1 pb-3.5 shadow-card">{children}</div>;
}
