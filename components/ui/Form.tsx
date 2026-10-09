import type { ComponentProps, ReactNode } from "react";
import { gradeColor, gradeLabel, gradesFor, HOLD_COLORS, HOLD_COLOR_NAMES, STYLE_TAGS, type GradeSystem, type HoldColor } from "@/lib/design";

// 表單標籤
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mt-3.5 mb-1.5 block text-note text-muted">
      {children}
    </label>
  );
}

const field = "w-full min-w-0 rounded-field border border-line bg-sunk px-3 py-[11px]";
// iPhone 的日期框有自己的最小寬度和高度，會撐出格子、蓋到旁邊：固定高度、靠左
const dateFix = "block h-12 appearance-none text-left [&::-webkit-date-and-time-value]:text-left";

export function TextField({ className = "", ...rest }: ComponentProps<"input">) {
  return <input className={`${field} ${rest.type === "date" ? dateFix : ""} ${className}`} {...rest} />;
}

export function TextArea({ className = "", ...rest }: ComponentProps<"textarea">) {
  return <textarea className={`${field} min-h-[76px] resize-y leading-normal ${className}`} {...rest} />;
}

// 開關（原型 .sw2），可帶標題與說明
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span>
        {label}
        {hint && <small className="block text-meta text-muted">{hint}</small>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : undefined}
        onClick={() => onChange(!checked)}
        className="relative h-7 w-12 flex-none rounded-[14px] bg-line transition-colors duration-150 after:absolute after:top-[3px] after:left-[3px] after:size-[22px] after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(0,0,0,.3)] after:transition-transform after:duration-150 aria-checked:bg-accent aria-checked:after:translate-x-5"
      />
    </div>
  );
}

// 三選一（原型 .seg），例如感覺、難度體感
// small：一排小膠囊（圖示與文字同一行），用在路線卡片
export function Segmented<T extends number | string>({
  options,
  value,
  onChange,
  small = false,
}: {
  options: readonly { v: T; e: string; t: string }[];
  value: T | null;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={`${small ? "flex items-center justify-center gap-1 rounded-full py-1.5" : "grid justify-items-center rounded-field py-2"} border border-line px-0.5 text-note aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface`}
        >
          <span className={small ? "text-[15px] leading-none" : "text-[20px] leading-[1.2]"}>{o.e}</span>
          {o.t}
        </button>
      ))}
    </div>
  );
}

// 單選方塊（選填）：再按一次已選的就取消；cols 2 或 4 格一排，hint 是名稱下面的小字（例如影片的身高、動作）
export function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  cols,
}: {
  options: readonly { v: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  cols: 2 | 4;
}) {
  return (
    <div className={`grid gap-1.5 ${cols === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(value === o.v ? null : o.v)}
          className={`grid justify-items-center rounded-field border border-line px-0.5 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface ${
            o.hint ? "py-2" : "py-2.5 text-note whitespace-nowrap"
          }`}
        >
          {o.hint ? <b className="text-sub">{o.label}</b> : o.label}
          {o.hint && <span className="text-tiny opacity-70">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

// 岩點顏色選擇（原型 .swatches）
export function ColorPicker({ value, onChange }: { value: HoldColor; onChange: (c: HoldColor) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {HOLD_COLOR_NAMES.map((c) => (
        <button
          key={c}
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          style={{ background: HOLD_COLORS[c] }}
          className="aspect-square rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)] aria-pressed:outline-3 aria-pressed:outline-offset-2 aria-pressed:outline-ink"
        />
      ))}
    </div>
  );
}

// 難度選擇（原型 .grades）：抱石 VB、V0–V10（按鈕塗成館內膠帶顏色，選中的加框）、上攀 YDS 5.6–5.13d
export function GradePicker({ value, onChange, system = "v" }: { value: number; onChange: (g: number) => void; system?: GradeSystem }) {
  return (
    <div className={`grid gap-1.5 ${system === "yds" ? "grid-cols-4" : "grid-cols-6"}`}>
      {gradesFor(system).map((g) => {
        const c = gradeColor(g);
        return (
          <button
            key={g}
            aria-pressed={value === g}
            onClick={() => onChange(g)}
            style={c ? { background: c.bg, color: c.fg } : undefined}
            className={`rounded-cell py-1.5 font-num text-num-picker font-semibold ${
              c
                ? "shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)] aria-pressed:outline-3 aria-pressed:outline-offset-2 aria-pressed:outline-ink"
                : "border border-line aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
            }`}
          >
            {gradeLabel(g)}
          </button>
        );
      })}
    </div>
  );
}

// 路線風格複選（原型 .tagpick）
export function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STYLE_TAGS.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== t) : STYLE_TAGS.filter((x) => x === t || value.includes(x)))}
            className="rounded-full border border-line px-3.5 py-[5px] text-sub aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

// 勾選框，例如「影片裡其他人同意入鏡」
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="mt-3 flex items-start gap-2.5 text-sub leading-normal">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[3px] size-[18px] flex-none accent-accent" />
      <span>{children}</span>
    </label>
  );
}

// 1–5 分評分（人物卡自評）：一排五顆小按鈕
export function Rating({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-10 flex-none text-note font-bold">{label}</span>
      <div className="grid flex-1 grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            aria-label={`${label} ${n} 分`}
            onClick={() => onChange(n)}
            className={`rounded-full border py-1 font-num text-[15px] font-semibold ${
              value != null && n <= value ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
            } aria-checked:bg-accent aria-checked:text-surface`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
