import type { ComponentProps, ReactNode } from "react";
import { HOLD_COLORS, STATUS_LABEL, type HoldColor, type Status } from "@/lib/design";
import Icon from "./Icon";

// 難度數字（Barlow Condensed）
export function Grade({ grade, className = "text-num-row w-[50px]" }: { grade: number; className?: string }) {
  return <span className={`font-num font-bold ${className}`}>V{grade}</span>;
}

// 岩點色圓點
export function HoldDot({ color, className = "size-3.5" }: { color: HoldColor; className?: string }) {
  return <span className={`flex-none rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)] ${className}`} style={{ background: HOLD_COLORS[color] }} />;
}

// 直立色條（原型 .tape）
export function Tape({ color, className = "h-[42px]" }: { color: HoldColor; className?: string }) {
  return <span className={`w-3 flex-none rounded-tape shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)] ${className}`} style={{ background: HOLD_COLORS[color] }} />;
}

// 風格標籤
export function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {tags.map((t) => (
        <span key={t} className="rounded-full border border-line bg-sunk px-2 text-tiny text-ink">
          {t}
        </span>
      ))}
    </span>
  );
}

// NEW 標籤
export function NewBadge() {
  return <span className="ml-1.5 rounded bg-accent px-1.5 py-px align-[1px] text-[11px] font-bold text-surface">NEW</span>;
}

// 紀錄狀態標籤（原型 .st）；old=true 用在已下架路線
export function StatusBadge({ status, old = false }: { status: Status; old?: boolean }) {
  const look = {
    flash: "bg-flash text-flash-ink font-num text-[15px] leading-[1.3] italic tracking-[0.04em]",
    send: "bg-accent-soft text-accent text-meta",
    project: "border border-dashed border-muted text-muted text-meta",
  }[status];
  return (
    <span className={`inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-[3px] font-bold ${look} ${old ? "opacity-55" : ""}`}>
      {status === "flash" && <Icon name="flash" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

// 選擇紀錄狀態的三顆大按鈕（原型 .acts）
export function StatusPicker({ value, onChange }: { value: Status | null; onChange: (s: Status) => void }) {
  const on: Record<Status, string> = {
    flash: "aria-pressed:border-flash aria-pressed:bg-flash aria-pressed:text-flash-ink font-num text-num-picker leading-[1.2] italic tracking-[0.05em]",
    send: "aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-surface text-sub",
    project: "aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface text-sub",
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      {(["flash", "send", "project"] as Status[]).map((s) => (
        <button
          key={s}
          aria-pressed={value === s}
          onClick={() => onChange(s)}
          className={`grid justify-items-center gap-0.5 rounded-tile border-[1.5px] border-line px-1 pt-3 pb-2.5 font-bold transition-transform duration-100 active:scale-[0.97] ${on[s]}`}
        >
          <Icon name={s} className="size-[22px]" />
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

// 路線列（原型 .route）：已完攀左側酒紅線，Flash 黃線
export function RouteRow({
  color,
  grade,
  title,
  isNew,
  meta,
  quote,
  status,
  statusOld,
  ...rest
}: Omit<ComponentProps<"button">, "title"> & {
  color: HoldColor;
  grade: number;
  title: ReactNode;
  isNew?: boolean;
  meta?: ReactNode;
  quote?: string;
  status?: Status | null;
  statusOld?: boolean;
}) {
  const done = status === "flash" || status === "send";
  return (
    <li>
      <button
        className={`relative flex w-full items-center gap-3.5 rounded-tile bg-surface px-3.5 py-3 text-left shadow-card ${
          done ? `before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-r-[3px] ${status === "flash" ? "before:bg-flash" : "before:bg-accent"}` : ""
        }`}
        {...rest}
      >
        <Tape color={color} />
        <Grade grade={grade} />
        <span className="min-w-0 flex-1 text-meta leading-normal text-muted">
          <b className="text-sub font-medium text-ink">{title}</b>
          {isNew && <NewBadge />}
          {meta != null && (
            <>
              <br />
              {meta}
            </>
          )}
          {quote && <span className="block truncate text-ink">「{quote}」</span>}
        </span>
        {status && <StatusBadge status={status} old={statusOld} />}
      </button>
    </li>
  );
}

export function RouteList({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-none gap-2 p-0">{children}</ul>;
}

// 留言數
export function CommentCount({ n }: { n: number }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-[3px]">
      <Icon name="chat" />
      {n}
    </span>
  );
}

// 評語框
export function SetterNote({ children }: { children: ReactNode }) {
  return <div className="mt-2 rounded-field bg-sunk px-3 py-2 text-note">{children}</div>;
}
