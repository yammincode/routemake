import { gradeLabel } from "@/lib/design";
import type { ReactNode } from "react";
import { tapeLook } from "./Gym";

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

// 本月完攀的直條圖（跟「全館難度分布」一樣的樣子）：每個難度一根，上面寫幾條，黃色那段是 Flash
// 抱石用膠帶顏色，難度下面再畫一小段膠帶色（整根都是 Flash 時也看得出顏色）；上攀（tone="accent"）用主色
// 點一根選它（其他變淡）、再點一次取消；沒有紀錄的那根不能點（變淡）
// 沒有完攀、只有其他紀錄（長耐力嘗試中、岩友路線）的那根畫一小段虛線，看得出來點得到；more 是報給讀螢幕軟體的補充
export type MonthCol = { key: string; label: string; grade: number; sends: number; flashes: number; items: number; more?: string };
export function MonthGradeChart({
  title,
  cols,
  picked,
  onPick,
  tone = "tape",
}: {
  title: string;
  cols: MonthCol[];
  picked: string | null;
  onPick: (key: string | null) => void;
  tone?: "tape" | "accent";
}) {
  const total = cols.reduce((s, c) => s + c.sends, 0);
  const flashes = cols.reduce((s, c) => s + c.flashes, 0);
  const max = Math.max(1, ...cols.map((c) => c.sends));
  const H = 64;
  return (
    <div className="mb-2 rounded-card bg-surface px-4 pt-3.5 pb-3 shadow-card">
      <div className="mb-2 flex items-baseline justify-between">
        <b className="text-note">{title}</b>
        <span className="text-meta text-muted">
          共 <b className="font-num text-num-chip leading-none text-ink">{total}</b> 條
          {flashes > 0 && (
            <>
              ・<span className="inline-block size-2 rounded-[2px] bg-flash align-middle" /> Flash <b className="font-num text-ink">{flashes}</b>
            </>
          )}
        </span>
      </div>
      <div className="grid items-end gap-1" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((c) => {
          const t = tapeLook(c.grade);
          const on = picked === c.key;
          const h = c.sends ? Math.max(6, (c.sends / max) * H) : 3;
          const fh = c.sends ? (c.flashes / c.sends) * h : 0;
          return (
            <button
              key={c.key}
              aria-pressed={on}
              aria-label={`${c.label}，完攀 ${c.sends} 條${c.flashes ? `，其中 Flash ${c.flashes} 條` : ""}${c.more ? `，${c.more}` : ""}`}
              disabled={!c.items}
              onClick={() => onPick(on ? null : c.key)}
              className={`grid justify-items-center gap-0.5 disabled:opacity-40 ${picked && !on ? "opacity-40" : ""}`}
            >
              <span className="font-num text-meta leading-none font-semibold text-muted">{c.sends || ""}</span>
              {c.sends ? (
                <span
                  style={{ height: `${h}px`, ...(tone === "tape" ? t.style : {}) }}
                  className={`flex w-full flex-col overflow-hidden rounded-tape ${tone === "tape" ? t.cls : "bg-accent"} ${on ? "outline-2 outline-offset-1 outline-ink" : ""}`}
                >
                  {fh > 0 && <span className="w-full flex-none bg-flash" style={{ height: `${fh}px` }} />}
                </span>
              ) : c.items ? (
                <span className={`h-2.5 w-full rounded-tape border border-dashed border-muted ${on ? "outline-2 outline-offset-1 outline-ink" : ""}`} />
              ) : (
                <span className="h-[3px] w-full rounded-tape bg-line" />
              )}
              {tone === "tape" && <span aria-hidden style={t.style} className={`h-[5px] w-3/5 rounded-tape ${t.cls}`} />}
              <span className={`font-num text-meta leading-tight font-bold ${on ? "text-ink" : ""}`}>{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 難度長條圖（原型 .gbars）
export function GradeBars({ rows }: { rows: { grade: number; ratio: number; label: string }[] }) {
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <div key={r.grade} className="grid grid-cols-[52px_1fr_56px] items-center gap-2.5">
          <span className="font-num text-num-bar font-bold">{gradeLabel(r.grade)}</span>
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

// 每日積分直條圖：一天一條，點一下（或滑過）在上方顯示當天分數；0 分的日子只畫底線
export function DailyBars({
  year,
  month,
  points,
  today,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  points: Record<number, number>;
  today?: number;
  selected: number | null;
  onSelect: (day: number) => void;
}) {
  const days = new Date(year, month, 0).getDate();
  const max = Math.max(1, ...Object.values(points));
  const ticks = [1, 5, 10, 15, 20, 25, days];
  return (
    <div>
      <div className="flex h-28 items-end border-b border-line" role="group" aria-label={`${month} 月每日積分`}>
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const v = points[d] ?? 0;
          const on = selected === d;
          return (
            <button
              key={d}
              aria-label={`${month}/${d} ${v} 分`}
              aria-pressed={on}
              onClick={() => onSelect(d)}
              onMouseEnter={() => onSelect(d)}
              className="group flex h-full flex-1 items-end justify-center px-px"
            >
              <span
                className={`block w-full max-w-6 rounded-t-[4px] ${v ? (on ? "bg-ink" : "bg-accent") : "h-0"}`}
                style={v ? { height: `${Math.max(4, (v / max) * 100)}%` } : undefined}
              />
            </button>
          );
        })}
      </div>
      <div className="relative mt-1 h-4 text-tiny text-muted">
        {ticks.map((d) => (
          <span
            key={d}
            className={`absolute -translate-x-1/2 font-num ${d === today ? "font-bold text-ink" : ""}`}
            style={{ left: `${((d - 0.5) / days) * 100}%` }}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

// 趨勢直條圖（使用狀況：最近 30 天每天幾人使用）：一天一條，點一下（或滑過）顯示當天數字；0 的日子只畫底線
export function TrendBars({
  items,
  selected,
  onSelect,
  label,
}: {
  items: { key: string; tick: string; title: string; value: number }[];
  selected: number | null;
  onSelect: (i: number) => void;
  label: string;
}) {
  const max = Math.max(1, ...items.map((x) => x.value));
  const n = items.length;
  const ticks = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div>
      <div className="mb-1 h-5 text-center text-meta text-muted">{selected != null && items[selected] ? items[selected].title : "點一下長條看當天數字"}</div>
      <div className="flex h-28 items-end border-b border-line" role="group" aria-label={label}>
        {items.map((x, i) => (
          <button
            key={x.key}
            aria-label={x.title}
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
            onMouseEnter={() => onSelect(i)}
            className="flex h-full flex-1 items-end justify-center px-px"
          >
            <span
              className={`block w-full max-w-6 rounded-t-[4px] ${x.value ? (selected === i ? "bg-ink" : "bg-accent") : "h-0"}`}
              style={x.value ? { height: `${Math.max(4, (x.value / max) * 100)}%` } : undefined}
            />
          </button>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-tiny text-muted">
        {ticks.map((i) => (
          <span key={i} className="absolute -translate-x-1/2 font-num" style={{ left: `${((i + 0.5) / n) * 100}%` }}>
            {items[i]?.tick}
          </span>
        ))}
      </div>
    </div>
  );
}
