"use client";

// 訓練日誌（step51）的共用元件：我的紀錄四個分頁、這週卡片、專案、日誌卡片、里程碑、難度金字塔、試了幾次
// 顏色以館內膠帶為主（lib/design.ts 的 GRADE_COLORS）：分頁底線、這週卡片漸層、金字塔每層都用膠帶色；館用各店標準色
import type { ReactNode } from "react";
import { gradeColor, gradeLabel, isYds, type HoldColor, type Status } from "@/lib/design";
import { GYM_COLORS, findGym, gymShort } from "@/lib/gyms";
import { Grade, HoldDot, StatusBadge } from "./Route";

const tape = (g: number) => gradeColor(g)?.bg ?? "var(--accent)";
// 這週卡片：桃紅（V2）到紅（V5）的膠帶色漸層；進度圈、連續週數用螢光黃（V0）
const HERO = `linear-gradient(135deg, ${tape(2)} 0%, ${tape(5)} 100%)`;
const LIME = tape(0);

// 我的紀錄上面的四個分頁；home＝主頁（右上小 ★）
export function MeTabs<T extends string>({
  tabs,
  value,
  home,
  onChange,
}: {
  tabs: readonly { key: T; label: string; tape: number }[];
  value: T;
  home: T | null;
  onChange: (key: T) => void;
}) {
  return (
    <div role="tablist" aria-label="我的紀錄" className="mb-3 grid grid-cols-4 gap-1 rounded-field bg-sunk p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className="relative rounded-[9px] pt-2 pb-2.5 text-note font-medium text-muted aria-selected:bg-surface aria-selected:font-bold aria-selected:text-ink aria-selected:shadow-card"
        >
          {t.label}
          {home === t.key && (
            <span aria-label="（主頁）" className="absolute top-0.5 right-1.5 text-[10px] leading-none text-flash">
              ★
            </span>
          )}
          {value === t.key && <span aria-hidden className="absolute inset-x-[24%] bottom-1 h-[3px] rounded-full" style={{ background: tape(t.tape) }} />}
        </button>
      ))}
    </div>
  );
}

// 每頁右上角：「☆ 設成主頁」，已經是主頁寫「★ 主頁」
export function HomePin({ home, disabled, onSet }: { home: boolean; disabled?: boolean; onSet: () => void }) {
  return (
    <div className="-mt-1 mb-2 flex justify-end">
      <button
        aria-pressed={home}
        disabled={disabled || home}
        onClick={onSet}
        className="rounded-full border border-line px-3 py-0.5 text-meta text-muted disabled:opacity-100 aria-pressed:border-flash aria-pressed:font-bold aria-pressed:text-ink"
      >
        {home ? "★ 主頁" : "☆ 設成主頁"}
      </button>
    </div>
  );
}

// 進度圈（這週爬了幾天 / 目標幾天）
function Ring({ n, of }: { n: number; of: number }) {
  const c = 2 * Math.PI * 25;
  const d = Math.min(1, n / Math.max(1, of)) * c;
  return (
    <svg viewBox="0 0 62 62" className="size-[62px] flex-none" aria-hidden>
      <circle cx="31" cy="31" r="25" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="7" />
      {n > 0 && <circle cx="31" cy="31" r="25" fill="none" stroke={LIME} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${d} ${c}`} transform="rotate(-90 31 31)" />}
      <text x="31" y="37" textAnchor="middle" className="font-num" fontWeight="700" fontSize="19" fill="#fff">
        {n}/{of}
      </text>
    </svg>
  );
}

// 這週：目標圈、連續週數、這週一到日哪幾天有爬；onGoal 改目標（1–7 天）
export function WeekCard({
  goal,
  days,
  today,
  streak,
  sends,
  points,
  editing,
  onEdit,
  onGoal,
}: {
  goal: number;
  days: number[]; // 1＝週一…7＝週日
  today: number;
  streak: number;
  sends: number | null;
  points: number | null;
  editing: boolean;
  onEdit: () => void;
  onGoal: (n: number) => void;
}) {
  const n = new Set(days).size;
  const left = Math.max(0, goal - n);
  return (
    <section aria-label="這週目標" className="rounded-card px-4 pt-3.5 pb-3 text-white shadow-card" style={{ background: HERO }}>
      <div className="flex items-center gap-3.5">
        <Ring n={n} of={goal} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <b className="text-sub">
            這週目標：爬 {goal} 天
            <button onClick={onEdit} aria-expanded={editing} className="ml-1.5 align-[1px] text-meta font-normal underline underline-offset-2 opacity-90">
              改
            </button>
          </b>
          <span className="text-meta opacity-90">
            {left ? `還差 ${left} 天` : "達標了！"}
            {sends != null && `・這週完攀 ${sends} 條`}
            {points != null && `・${points} 分`}
          </span>
          <span className="justify-self-start rounded-full px-2.5 py-px text-meta font-bold" style={{ background: "rgba(0,0,0,.22)", color: LIME }}>
            🔥 {streak ? `連續 ${streak} 週` : "這週開始連續"}
          </span>
        </div>
      </div>
      {editing && (
        <div role="radiogroup" aria-label="每週目標幾天" className="mt-3 grid grid-cols-7 gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((g) => (
            <button
              key={g}
              role="radio"
              aria-checked={g === goal}
              aria-label={`每週 ${g} 天`}
              onClick={() => onGoal(g)}
              className="rounded-full bg-black/20 py-1 font-num text-sub font-bold aria-checked:bg-white aria-checked:text-ink"
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-tiny" aria-label="這週哪幾天有爬">
        {"一二三四五六日".split("").map((c, i) => {
          const on = days.includes(i + 1);
          return (
            <span
              key={c}
              aria-label={`週${c}${on ? "有爬" : ""}`}
              className={`rounded-cell py-0.5 ${i + 1 === today ? "shadow-[inset_0_0_0_1.5px_#fff]" : ""}`}
              style={on ? { background: LIME, color: "#17201C", fontWeight: 700 } : { background: "rgba(255,255,255,.16)" }}
            >
              {c}
            </span>
          );
        })}
      </div>
    </section>
  );
}

// 我的專案一張：難度膠帶、岩點顏色、哪一區、換線倒數（快換線變橘色）、來了幾天、試了幾次
export function ProjectCard({
  grade,
  color,
  where,
  due,
  warn,
  detail,
  onClick,
}: {
  grade: number;
  color: HoldColor | null;
  where: string;
  due: string | null;
  warn: boolean;
  detail: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button onClick={onClick} className={`grid w-full gap-1 rounded-tile bg-surface px-3.5 py-2.5 text-left shadow-card ${warn ? "shadow-[inset_3px_0_0_var(--warn)]" : ""}`}>
        <span className="flex items-center gap-2">
          <Grade grade={grade} className="w-auto min-w-[30px] text-num-pin leading-[1.35]" />
          {color && <HoldDot color={color} className="size-3" />}
          <b className="min-w-0 flex-1 truncate text-note">{where}</b>
          {due && <span className={`flex-none text-meta ${warn ? "font-bold text-warn" : "text-muted"}`}>{due}</span>}
        </span>
        <span className="text-meta text-muted">{detail}</span>
      </button>
    </li>
  );
}

// 感覺 1–5（●●●●○）
export function FeelDots({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span aria-label={`感覺 ${value} 分`} className="flex-none text-tiny tracking-[1px] text-flash">
      {"●".repeat(value)}
      <span className="text-line">{"●".repeat(5 - value)}</span>
    </span>
  );
}

// 日誌裡的一條路線（難度膠帶、岩點顏色、哪一區、過程、狀態）
export function LogRoute({ grade, color, title, note, status, onClick }: { grade: number; color: HoldColor | null; title: string; note?: string; status: Status; onClick?: () => void }) {
  return (
    <li>
      <button onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-2 py-1.5 text-left">
        {isYds(grade) ? <span className="w-[38px] flex-none font-num text-meta font-bold">{gradeLabel(grade)}</span> : <Grade grade={grade} className="w-auto min-w-[30px] flex-none text-num-pin leading-[1.35]" />}
        {color && <HoldDot color={color} className="size-3" />}
        <span className="min-w-0 flex-1 text-meta leading-snug">
          <span className="block truncate text-ink">{title}</span>
          {note && <span className="block text-tiny text-muted">{note}</span>}
        </span>
        <StatusBadge status={status} />
      </button>
    </li>
  );
}

// 日誌一天一張：日期、去了哪幾館（館色點）、感覺；下面放路線、一句話、按鈕
export function LogDayCard({ title, gyms, feel, children, footer }: { title: string; gyms: string[]; feel: number | null; children?: ReactNode; footer?: ReactNode }) {
  return (
    <section aria-label={`${title} 日誌`} className="relative rounded-card bg-surface px-4 pt-3 pb-3 shadow-card">
      <div className="flex items-center gap-2">
        <b className="text-sub">{title}</b>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-meta text-muted">
          {gyms.map((g) => (
            <span key={g} className="inline-flex items-center gap-1" data-gym={g}>
              <i aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: GYM_COLORS[g] ?? "var(--muted)" }} />
              {gymShort(findGym(g)?.name ?? g)}
            </span>
          ))}
        </span>
        <FeelDots value={feel} />
      </div>
      {children}
      {footer && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-meta text-muted">{footer}</div>}
    </section>
  );
}

// 里程碑（第一次完攀、新的最高難度）：螢光黃（V0 膠帶色）框
export function MilestoneRow({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-tile px-3.5 py-2 text-note" style={{ background: "color-mix(in srgb, " + LIME + " 18%, transparent)", boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${LIME} 55%, transparent)` }}>
      {children}
    </p>
  );
}

// 難度金字塔：每一層用那個難度的膠帶色，寬度越下面越寬；達到目標的整塊上色，還沒的淡一點；next＝下一步（虛線框）
export function PyramidCard({ rows, next, tip }: { rows: { grade: number; done: number; goal: number }[]; next: number | null; tip: string }) {
  const show = next != null && !rows.some((r) => r.grade === next) ? [{ grade: next, done: 0, goal: 1 }, ...rows] : rows;
  return (
    <section aria-label="難度金字塔" className="mb-3 rounded-card bg-surface px-4 pt-3.5 pb-3.5 shadow-card">
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-note font-bold">難度金字塔</h4>
        <span className="text-meta text-muted">抱石・全部完攀</span>
      </div>
      <div className="grid justify-items-center gap-1">
        {show.map((r, i) => {
          const c = gradeColor(r.grade);
          const ok = r.done >= r.goal;
          const isNext = r.grade === next;
          return (
            <div
              key={r.grade}
              data-grade={r.grade}
              className={`flex h-[22px] items-center justify-center gap-1 rounded-cell font-num text-meta font-bold ${isNext ? "border-2 border-dashed" : ""}`}
              style={{
                width: `${Math.min(100, 30 + (i * 70) / Math.max(1, show.length - 1))}%`,
                background: isNext ? "transparent" : (c?.bg ?? "var(--sunk)"),
                color: isNext ? "var(--ink)" : (c?.fg ?? "var(--ink)"),
                borderColor: isNext ? (c?.bg ?? "var(--muted)") : undefined,
                opacity: ok || isNext ? 1 : 0.55,
              }}
            >
              {gradeLabel(r.grade)} {r.done}/{r.goal}
              {ok && " ✓"}
              {isNext && <span className="font-sans text-tiny font-bold">下一步</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-2 mb-0 text-meta text-muted">{tip}</p>
    </section>
  );
}

// 試了幾次：－ 數字 ＋（不按也可以；1–99）
export function TriesStepper({ label, value, disabled, onChange }: { label: string; value: number | null; disabled?: boolean; onChange: (n: number | null) => void }) {
  const btn = "grid size-8 place-items-center rounded-full border border-line text-sub disabled:opacity-40";
  return (
    <div className="mt-2 flex items-center justify-between gap-3 text-note" role="group" aria-label={label}>
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <button aria-label="少一次" disabled={disabled || !value} onClick={() => onChange(value && value > 1 ? value - 1 : null)} className={btn}>
          －
        </button>
        <b className="w-8 text-center font-num text-num-chip" aria-live="polite">
          {value ?? "–"}
        </b>
        <button aria-label="多一次" disabled={disabled || (value ?? 0) >= 99} onClick={() => onChange((value ?? 0) + 1)} className={btn}>
          ＋
        </button>
      </span>
    </div>
  );
}
