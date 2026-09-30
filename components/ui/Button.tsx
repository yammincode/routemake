import type { ComponentProps } from "react";

type Variant = "default" | "primary" | "danger";

const VARIANT: Record<Variant, string> = {
  default: "border-line",
  primary: "border-ink bg-ink text-surface",
  danger: "border-warn text-warn",
};

// 滿版按鈕（原型 .btn）；連續兩顆之間自動留 8px
export function Button({ variant = "default", className = "", ...rest }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      className={`block w-full rounded-btn border px-1.5 py-[13px] text-center font-bold disabled:opacity-50 [&+&]:mt-2 ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

// 文字連結按鈕（原型 .link，例如「取消」「清除紀錄」）
export function LinkButton({ className = "", ...rest }: ComponentProps<"button">) {
  return <button className={`mt-2 w-full p-2.5 text-note text-muted ${className}`} {...rest} />;
}
