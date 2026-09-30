import type { ReactNode } from "react";

// 紀錄列表（操作紀錄）：左邊時間、中間內容、下面是誰做的
export function LogList({ children }: { children: ReactNode }) {
  return <div className="grid gap-px overflow-hidden rounded-tile bg-line shadow-card">{children}</div>;
}

export function LogRow({ time, text, who }: { time: string; text: ReactNode; who?: string | null }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-3 bg-surface px-4 py-3">
      <span className="font-num text-[15px] leading-tight font-semibold text-muted">{time}</span>
      <span className="min-w-0">
        <span className="block text-sub leading-snug break-words">{text}</span>
        {who !== undefined && <small className="text-meta text-muted">{who ?? "系統管理者"}</small>}
      </span>
    </div>
  );
}
