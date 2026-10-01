import type { ReactNode } from "react";
import type { Status } from "@/lib/design";
import Icon from "./Icon";
import { StatusBadge } from "./Route";

// 顧客分享的影片（路線卡片「影片」區塊）；網址加 #t=0.1 讓手機顯示第一格畫面；沒有網址時顯示黑色預留框
export function VideoItem({
  src,
  name,
  ago,
  caption,
  status,
  meta,
  onDelete,
}: {
  src?: string;
  name: string;
  ago: string;
  caption?: string | null;
  status?: Status | null;
  meta?: ReactNode;
  onDelete?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-btn bg-sunk">
      {src ? (
        <video controls playsInline preload="metadata" src={`${src}#t=0.1`} className="block max-h-[60vh] w-full bg-black" />
      ) : (
        <div className="grid aspect-video place-items-center bg-black text-white/60">
          <Icon name="video" className="size-8" />
        </div>
      )}
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2 text-meta text-muted">
          <span className="flex min-w-0 items-center gap-1.5">
            <b className="truncate font-bold text-ink">{name}</b>
            {ago}
            {status && <StatusBadge status={status} />}
          </span>
          {onDelete && (
            <button onClick={onDelete} className="flex-none px-1 py-0.5 text-meta text-warn">
              刪除
            </button>
          )}
        </div>
        {meta && <div className="mt-0.5 text-meta text-muted">{meta}</div>}
        {caption && <p className="mt-0.5 mb-0 text-sub leading-normal break-words">{caption}</p>}
      </div>
    </div>
  );
}

export function VideoList({ children }: { children: ReactNode }) {
  return <div className="mb-3 grid gap-2.5">{children}</div>;
}

// 選擇影片的按鈕（外觀同滿版按鈕）；選好後回傳檔案
export function VideoPickButton({ onPick, disabled, children }: { onPick: (f: File) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label
      aria-disabled={disabled}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-btn border border-line px-1.5 py-[13px] font-bold aria-disabled:pointer-events-none aria-disabled:opacity-50"
    >
      <Icon name="video" />
      {children}
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
    </label>
  );
}

// 已選的影片（上傳前）：檔名、大小
export function PickedFile({ name, size, onClear }: { name: string; size: number; onClear?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-field bg-sunk px-3 py-2.5 text-note">
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon name="video" />
        <span className="truncate">{name}</span>
        <span className="flex-none text-muted">{(size / 1048576).toFixed(1)} MB</span>
      </span>
      {onClear && (
        <button onClick={onClear} className="flex-none px-1 text-meta text-muted">
          換一支
        </button>
      )}
    </div>
  );
}
