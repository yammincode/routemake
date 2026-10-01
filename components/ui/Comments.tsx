import type { ReactNode } from "react";
import Icon from "./Icon";

// 留言（原型 .cmt）；likes／liked／onLike：👍 按讚（沒有 onLike 時只顯示讚數）；edited：顯示「已編輯」
export function CommentItem({
  name,
  ago,
  body,
  onDelete,
  onEdit,
  edited = false,
  likes = 0,
  liked = false,
  onLike,
}: {
  name: string;
  ago: string;
  body: string;
  onDelete?: () => void;
  onEdit?: () => void;
  edited?: boolean;
  likes?: number;
  liked?: boolean;
  onLike?: () => void;
}) {
  return (
    <div className="h-full rounded-btn bg-sunk px-3 py-2.5">
      <div className="flex items-center justify-between text-meta text-muted">
        <span>
          <b className="mr-1.5 font-bold text-ink">{name}</b>
          {ago}
          {edited && <span className="ml-1">・已編輯</span>}
        </span>
        <span className="flex-none">
          {onEdit && (
            <button onClick={onEdit} className="px-1 py-0.5 text-meta text-accent">
              編輯
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="px-1 py-0.5 text-meta text-warn">
              刪除
            </button>
          )}
        </span>
      </div>
      <p className="mt-0.5 mb-0 text-sub leading-normal break-words">{body}</p>
      {(onLike || likes > 0) && (
        <div className="mt-1.5 flex">
          <button
            aria-pressed={liked}
            aria-label={liked ? `收回讚，目前 ${likes} 個讚` : `按讚，目前 ${likes} 個讚`}
            disabled={!onLike}
            onClick={onLike}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-[3px] text-meta text-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-bold aria-pressed:text-accent disabled:border-transparent disabled:px-0"
          >
            <span aria-hidden>👍</span>
            {likes > 0 ? <span className="font-num">{likes}</span> : "讚"}
          </button>
        </div>
      )}
    </div>
  );
}

// scroll：留言多時改成左右滑動的一排卡片（每張約八成寬，露出下一張提示可以滑）
export function CommentList({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <div className="mb-3 grid gap-2.5">{children}</div>;
  return (
    <div className="no-scrollbar -mx-5 mb-3 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1 [&>*]:w-[80%] [&>*]:flex-none [&>*]:snap-start">
      {children}
    </div>
  );
}

// 留言輸入列（原型 .cform）
export function CommentForm({
  value,
  onChange,
  onSubmit,
  submitLabel = "送出",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
}) {
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
        {submitLabel}
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
