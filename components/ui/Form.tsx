import type { ComponentProps, ReactNode } from "react";
import { GRADES, HOLD_COLORS, HOLD_COLOR_NAMES, STYLE_TAGS, type HoldColor } from "@/lib/design";

// 表單標籤
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mt-3.5 mb-1.5 block text-note text-muted">
      {children}
    </label>
  );
}

const field = "w-full rounded-field border border-line bg-sunk px-3 py-[11px]";

export function TextField({ className = "", ...rest }: ComponentProps<"input">) {
  return <input className={`${field} ${className}`} {...rest} />;
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
export function Segmented<T extends number | string>({
  options,
  value,
  onChange,
}: {
  options: readonly { v: T; e: string; t: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className="grid justify-items-center rounded-field border border-line px-0.5 py-2 text-note aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
        >
          <span className="text-[20px] leading-[1.2]">{o.e}</span>
          {o.t}
        </button>
      ))}
    </div>
  );
}

// 岩點顏色選擇（原型 .swatches）
export function ColorPicker({ value, onChange }: { value: HoldColor; onChange: (c: HoldColor) => void }) {
  return (
    <div className="grid grid-cols-9 gap-1.5">
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

// 難度選擇 V0–V10（原型 .grades）
export function GradePicker({ value, onChange }: { value: number; onChange: (g: number) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {GRADES.map((g) => (
        <button
          key={g}
          aria-pressed={value === g}
          onClick={() => onChange(g)}
          className="rounded-cell border border-line py-1.5 font-num text-num-picker font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
        >
          V{g}
        </button>
      ))}
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
