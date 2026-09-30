import type { ReactNode } from "react";
import Icon from "./Icon";

// 留言（原型 .cmt）
export function CommentItem({ name, ago, body, onDelete }: { name: string; ago: string; body: string; onDelete?: () => void }) {
  return (
    <div className="rounded-btn bg-sunk px-3 py-2.5">
      <div className="flex items-center justify-between text-meta text-muted">
        <span>
          <b className="mr-1.5 font-bold text-ink">{name}</b>
          {ago}
        </span>
        {onDelete && (
          <button onClick={onDelete} className="px-1 py-0.5 text-meta text-warn">
            刪除
          </button>
        )}
      </div>
      <p className="mt-0.5 mb-0 text-sub leading-normal break-words">{body}</p>
    </div>
  );
}

export function CommentList({ children }: { children: ReactNode }) {
  return <div className="mb-3 grid gap-2.5">{children}</div>;
}

// 留言輸入列（原型 .cform）
export function CommentForm({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
        placeholder="公開留言，大家都看得到"
        className="min-h-11 flex-1 resize-y rounded-field border border-line bg-sunk px-3 py-[11px] leading-normal"
      />
      <button onClick={onSubmit} className="flex-none rounded-field bg-ink px-3.5 py-2.5 font-bold text-surface">
        送出
      </button>
    </div>
  );
}

// 留言關閉提示（原型 .closed）
export function ClosedNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-field bg-sunk px-3 py-2.5 text-note text-muted">
      <Icon name="lock" />
      {children}
    </div>
  );
}

// 「只有你自己看得到」
export function PrivateHint() {
  return (
    <div className="mt-1 text-tiny text-muted">
      <Icon name="lock" /> 只有你自己看得到
    </div>
  );
}
