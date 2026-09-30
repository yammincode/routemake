import type { ComponentProps } from "react";

// 一般卡片：白底、圓角 16、卡片陰影
export function Card({ className = "", ...rest }: ComponentProps<"div">) {
  return <div className={`rounded-card bg-surface shadow-card ${className}`} {...rest} />;
}

// 頁面大標
export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <>
      <h1 className={`mt-1 text-title font-black tracking-[0.01em] ${sub ? "mb-1.5" : "mb-4"}`}>{children}</h1>
      {sub && <p className="mt-0 mb-[18px] text-sub text-muted">{sub}</p>}
    </>
  );
}

// 區塊標題（原型 h3）
export function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`mt-[30px] mb-3 text-section font-bold ${className}`}>{children}</h3>;
}

// 空狀態
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="m-0 rounded-tile bg-surface p-4 text-sub text-muted">{children}</p>;
}

// 小提示文字
export function Tip({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 mb-2.5 text-note text-muted">{children}</p>;
}

// 返回連結
export function BackLink({ children, ...rest }: ComponentProps<"button">) {
  return (
    <button className="inline-flex gap-1.5 py-1.5 text-sub text-muted" {...rest}>
      ‹ {children}
    </button>
  );
}
