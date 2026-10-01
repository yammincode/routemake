import type { ComponentProps, ReactNode } from "react";

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
