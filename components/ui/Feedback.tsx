import type { ReactNode } from "react";
import type { FeedbackKind, FeedbackStatus } from "@/lib/data";

export const FEEDBACK_KIND: Record<FeedbackKind, string> = { idea: "功能建議", bug: "問題回報", other: "其他" };
export const FEEDBACK_STATUS: Record<FeedbackStatus, string> = { new: "未讀", doing: "處理中", done: "已完成" };

// 回饋處理狀態：未讀（酒紅）、處理中（Flash 黃）、已完成（灰）
export function FeedbackStatusPill({ status }: { status: FeedbackStatus }) {
  const tone = status === "new" ? "bg-accent text-surface" : status === "doing" ? "bg-flash text-flash-ink" : "bg-sunk text-muted";
  return <span className={`flex-none rounded-full px-2.5 py-px text-tiny font-bold ${tone}`}>{FEEDBACK_STATUS[status]}</span>;
}

// 一則回饋：類型、時間、狀態，下面是內容；meta（送出者、版本）與 actions（改狀態）選填
export function FeedbackItem({
  kind,
  status,
  when,
  children,
  meta,
  actions,
}: {
  kind: FeedbackKind;
  status: FeedbackStatus;
  when: string;
  children: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="grid gap-1.5 bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta text-muted">
          <b className="text-ink">{FEEDBACK_KIND[kind]}</b>・{when}
        </span>
        <FeedbackStatusPill status={status} />
      </div>
      <p className="m-0 text-sub break-words whitespace-pre-wrap">{children}</p>
      {meta && <p className="m-0 text-tiny text-muted break-words">{meta}</p>}
      {actions}
    </li>
  );
}

export function FeedbackList({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-none gap-px overflow-hidden rounded-tile bg-line p-0 shadow-card">{children}</ul>;
}
