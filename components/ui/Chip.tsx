import type { ComponentProps, ReactNode } from "react";
import { gradeColor, gradeLabel } from "@/lib/design";

// 可左右滑動的一排篩選（原型 .chips）
export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pt-0.5 pb-2.5">{children}</div>;
}

// 篩選膠囊；num=true 用 Barlow Condensed（難度），否則中文
export function Chip({
  pressed,
  num = false,
  className = "",
  ...rest
}: ComponentProps<"button"> & { pressed: boolean; num?: boolean }) {
  return (
    <button
      aria-pressed={pressed}
      className={`flex-none rounded-full border border-line bg-surface px-3.5 py-[3px] disabled:opacity-45 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg ${
        num ? "font-num text-num-chip font-semibold" : "text-note leading-[1.9] font-medium"
      } ${className}`}
      {...rest}
    />
  );
}

// 難度篩選：塗成館內膠帶顏色，選中的加框（還沒定顏色的用一般樣式）
export function GradeChip({ grade, pressed, ...rest }: ComponentProps<"button"> & { grade: number; pressed: boolean }) {
  const c = gradeColor(grade);
  if (!c)
    return (
      <Chip num pressed={pressed} {...rest}>
        {gradeLabel(grade)}
      </Chip>
    );
  return (
    <button
      aria-pressed={pressed}
      style={{ background: c.bg, color: c.fg }}
      className="flex-none rounded-full px-3.5 py-[3px] font-num text-num-chip font-semibold shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)] aria-pressed:shadow-[inset_0_0_0_3px_var(--ink)]"
      {...rest}
    >
      {gradeLabel(grade)}
    </button>
  );
}
