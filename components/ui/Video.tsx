"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { STATUS_LABEL, type Status } from "@/lib/design";
import Icon from "./Icon";
import { StatusBadge } from "./Route";

export type VideoCard = {
  key: string;
  src?: string; // 沒有網址時顯示黑色預留框（展示頁用）
  name: string;
  ago: string;
  caption?: string | null;
  status?: Status | null;
  duration?: number | null; // 秒
  tags?: string; // 「身高 170–179cm・動態」（videoTagText）
  meta?: ReactNode; // 例如後台的「B 區 B-03」
  onName?: () => void; // 點名字看人物卡
};

// 片長 0:42
const clock = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// 分享者在這條的紀錄：小圓圖示＋小字，比標題安靜
const RESULT_DOT: Record<Status, string> = {
  flash: "bg-flash text-flash-ink",
  send: "bg-accent-soft text-accent",
  project: "border border-dashed border-muted text-muted",
};
export function VideoResult({ status }: { status: Status }) {
  return (
    <span className="inline-flex flex-none items-center gap-1 text-meta text-muted">
      <span className={`grid size-[18px] place-items-center rounded-full ${RESULT_DOT[status]}`}>
        <Icon name={status} className="size-3" />
      </span>
      {status === "flash" ? <span className="font-num text-[15px] leading-none font-semibold tracking-[0.04em] italic">Flash</span> : STATUS_LABEL[status]}
    </span>
  );
}

// 影片一列（像 Spray Wall 路線列）：方形縮圖（第一格畫面、▶、片長）｜標題（說明，沒寫就是「某某的攀爬」）、誰・多久前＋紀錄、身高・動作
// 整列點了就播放
export function VideoRow({ v, onClick }: { v: VideoCard; onClick: () => void }) {
  const [bad, setBad] = useState(false);
  const title = v.caption || `${v.name}的攀爬`;
  return (
    <li>
      <button
        aria-label={[`播放 ${v.name} 的影片：${title}`, v.duration != null && clock(v.duration), v.status && STATUS_LABEL[v.status], v.tags].filter(Boolean).join("，")}
        onClick={onClick}
        className="flex w-full items-start gap-3 rounded-tile bg-sunk p-2.5 text-left"
      >
        <span className="relative block size-[72px] flex-none overflow-hidden rounded-field bg-black">
          {v.src && !bad && (
            <video
              muted
              playsInline
              preload="metadata"
              src={`${v.src}#t=0.1`}
              onError={() => setBad(true)}
              className="pointer-events-none absolute inset-0 size-full object-cover"
            />
          )}
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-[26px] place-items-center rounded-full bg-black/45 text-white">
              <Icon name="play" className="size-3.5" />
            </span>
          </span>
          {v.duration != null && (
            <span className="absolute right-1 bottom-1 rounded-tape bg-black/60 px-1 font-num text-tiny leading-[1.35] font-semibold text-white">{clock(v.duration)}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 pt-px">
          <b className="line-clamp-2 text-sub leading-snug font-bold break-words">{title}</b>
          <span className="mt-1 flex items-center justify-between gap-2 text-meta text-muted">
            {/* 沒寫說明時標題已經有名字，這行只寫時間 */}
            <span className="min-w-0 truncate">{v.caption ? `${v.name}・${v.ago}` : v.ago}</span>
            {v.status && <VideoResult status={v.status} />}
          </span>
          {v.meta && <span className="mt-0.5 block truncate text-tiny text-muted">{v.meta}</span>}
          {v.tags && <span className="mt-0.5 block truncate text-tiny text-muted">{v.tags}</span>}
        </span>
      </button>
    </li>
  );
}

export function VideoList({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-none gap-2 p-0">{children}</ul>;
}

// 影片縮圖：直式，顯示第一格畫面（網址加 #t=0.1 讓手機載入第一格）、上傳者、完成狀態
export function VideoThumb({ v, onClick }: { v: VideoCard; onClick: () => void }) {
  const [bad, setBad] = useState(false);
  return (
    <button
      onClick={onClick}
      aria-label={`播放 ${v.name} 的影片${v.caption ? "：" + v.caption : ""}`}
      className="relative aspect-[9/16] w-[112px] flex-none snap-start overflow-hidden rounded-btn bg-black text-left"
    >
      {v.src && !bad && (
        <video
          muted
          playsInline
          preload="metadata"
          src={`${v.src}#t=0.1`}
          onError={() => setBad(true)}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      )}
      <span className="absolute inset-0 grid place-items-center text-white/85">
        <span className="grid size-10 place-items-center rounded-full bg-black/45">
          <Icon name="play" className="size-5" />
        </span>
      </span>
      {v.status && (
        <span className="absolute top-1.5 left-1.5 origin-top-left scale-[0.8]">
          <StatusBadge status={v.status} />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-meta leading-tight text-white">
        <b className="block truncate font-bold">{v.name}</b>
        <span className="text-white/75">{v.ago}</span>
      </span>
    </button>
  );
}

// 橫向一排影片縮圖，左右滑動選擇
export function VideoStrip({ items, onOpen }: { items: VideoCard[]; onOpen: (i: number) => void }) {
  return (
    <div className="no-scrollbar mb-3 flex snap-x gap-2.5 overflow-x-auto pb-1">
      {items.map((v, i) => (
        <VideoThumb key={v.key} v={v} onClick={() => onOpen(i)} />
      ))}
    </div>
  );
}

// 全螢幕播放：左右滑動或按 ‹ › 換上一支／下一支；按 ✕、點背景或 Esc 關閉
// actions：放在說明下方的按鈕（例如刪除）
export function VideoViewer({
  items,
  index,
  onIndex,
  actions,
}: {
  items: VideoCard[];
  index: number | null;
  onIndex: (i: number | null) => void;
  actions?: (i: number) => ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const open = index != null && index >= 0 && index < items.length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // 不要連下面的面板一起關掉
        onIndex(null);
      }
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, index, items.length, onIndex]);

  if (!open) return null;
  const v = items[index];
  const go = (d: number) => {
    const n = index + d;
    if (n >= 0 && n < items.length) onIndex(n);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="影片播放"
      className="fixed inset-0 z-30 flex flex-col bg-black text-white"
      onClick={(e) => e.target === e.currentTarget && onIndex(null)}
    >
      <div className="flex items-center justify-between px-4 pt-[calc(10px+env(safe-area-inset-top,0px))] pb-2 text-meta text-white/75">
        <span className="font-num">
          {index + 1} / {items.length}
        </span>
        <button aria-label="關閉" onClick={() => onIndex(null)} className="grid size-10 place-items-center text-[26px] leading-none text-white">
          ×
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
        }}
        onClick={(e) => e.target === e.currentTarget && onIndex(null)}
      >
        {failed === v.key || !v.src ? (
          <p className="max-w-[260px] text-center text-sub leading-normal text-white/80">
            {v.src ? "這支影片無法在你的手機播放（可能是 iPhone 的 HEVC 格式），可以換一支手機或電腦試試看。" : "影片預覽"}
          </p>
        ) : (
          <video
            key={v.key}
            controls
            autoPlay
            playsInline
            src={v.src}
            onError={() => setFailed(v.key)}
            className="max-h-full w-full object-contain"
          />
        )}
        {index > 0 && (
          <button aria-label="上一支" onClick={() => go(-1)} className="absolute left-1 grid size-11 place-items-center rounded-full bg-black/40 text-[28px] leading-none">
            ‹
          </button>
        )}
        {index < items.length - 1 && (
          <button aria-label="下一支" onClick={() => go(1)} className="absolute right-1 grid size-11 place-items-center rounded-full bg-black/40 text-[28px] leading-none">
            ›
          </button>
        )}
      </div>
      <div className="px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-2 text-meta text-white/75">
          {v.onName ? (
            <button onClick={v.onName} className="text-sub font-bold text-white underline decoration-white/40 underline-offset-2">
              {v.name}
            </button>
          ) : (
            <b className="text-sub font-bold text-white">{v.name}</b>
          )}
          {v.ago}
          {v.status && <StatusBadge status={v.status} />}
        </div>
        {v.meta && <div className="mt-0.5 text-meta text-white/75">{v.meta}</div>}
        {v.tags && <div className="mt-0.5 text-meta text-white/75">{v.tags}</div>}
        {v.caption && <p className="mt-1 mb-0 text-sub leading-normal break-words">{v.caption}</p>}
        {actions && <div className="mt-2">{actions(index)}</div>}
      </div>
    </div>,
    document.body
  );
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

// 剪輯長度用的時間：0:12.5（整秒就不寫小數）
const clock1 = (s: number) => {
  const t = Math.round(s * 10) / 10;
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec < 10 ? "0" : ""}${Number.isInteger(sec) ? sec : sec.toFixed(1)}`;
};

// 剪輯長度（分享影片前）：上面預覽（拉哪一條就跳到那個位置；▶ 播放選的這段），中間時間軸畫出選的範圍，
// 下面「開始」「結束」兩條拉桿（－／＋ 每次 0.5 秒）；最多 max 秒、最少 1 秒，拉一條超過上限時另一條跟著移
export function VideoTrim({
  src,
  duration,
  start,
  end,
  max,
  onChange,
}: {
  src?: string; // 沒有網址時顯示黑色預留框（展示頁用）
  duration: number;
  start: number;
  end: number;
  max: number;
  onChange: (start: number, end: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const MIN = 1;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const seek = (t: number) => {
    const v = ref.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
    v.currentTime = t;
  };
  const set = (which: "start" | "end", t: number) => {
    let s = which === "start" ? r1(Math.min(Math.max(0, t), duration - MIN)) : start;
    let e = which === "end" ? r1(Math.min(Math.max(MIN, t), duration)) : end;
    if (which === "start") {
      if (e - s > max) e = r1(s + max);
      if (e - s < MIN) e = r1(Math.min(duration, s + MIN));
    } else {
      if (e - s > max) s = r1(e - max);
      if (e - s < MIN) s = r1(Math.max(0, e - MIN));
    }
    onChange(s, e);
    seek(which === "start" ? s : e);
  };
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (playing) return seek(v.currentTime);
    if (v.currentTime < start || v.currentTime >= end - 0.05) v.currentTime = start;
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };
  const row = (which: "start" | "end", label: string, value: number) => (
    <div className="mt-2 flex items-center gap-2">
      <label htmlFor={`trim-${which}`} className="w-9 flex-none text-meta text-muted">
        {label}
      </label>
      <button
        aria-label={`${label}往前 0.5 秒`}
        onClick={() => set(which, value - 0.5)}
        className="grid size-9 flex-none place-items-center rounded-full border border-line text-[18px]"
      >
        −
      </button>
      <input
        id={`trim-${which}`}
        type="range"
        min={0}
        max={duration}
        step={0.1}
        value={value}
        onChange={(e) => set(which, +e.target.value)}
        className="min-w-0 flex-1 accent-[var(--accent)]"
      />
      <button
        aria-label={`${label}往後 0.5 秒`}
        onClick={() => set(which, value + 0.5)}
        className="grid size-9 flex-none place-items-center rounded-full border border-line text-[18px]"
      >
        ＋
      </button>
      <span className="w-11 flex-none text-right font-num text-meta">{clock1(value)}</span>
    </div>
  );
  return (
    <div className="mt-2 rounded-tile bg-surface px-3 pt-3 pb-3.5 shadow-card">
      {src ? (
        <video
          ref={ref}
          src={src}
          muted
          playsInline
          preload="auto"
          aria-label="剪輯預覽"
          onLoadedMetadata={(e) => (e.currentTarget.currentTime = start)}
          onTimeUpdate={(e) => {
            if (playing && e.currentTarget.currentTime >= end) seek(end);
          }}
          className="aspect-video w-full rounded-cell bg-black object-contain"
        />
      ) : (
        <div className="aspect-video w-full rounded-cell bg-black" />
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <button onClick={toggle} className="flex items-center gap-1 px-1 py-1 text-note font-bold text-accent">
          {playing ? "❚❚ 暫停" : "▶ 播放選的這段"}
        </button>
        <span className="text-meta text-muted">
          已選 <b className="font-num text-ink">{clock1(start)}–{clock1(end)}</b>（{r1(end - start)} 秒）
        </span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-sunk" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-accent" style={{ left: `${(start / duration) * 100}%`, width: `${((end - start) / duration) * 100}%` }} />
      </div>
      {row("start", "開始", start)}
      {row("end", "結束", end)}
      <p className="mt-2 mb-0 text-tiny text-muted">最長 {max} 秒；分享時只會上傳選的這一段</p>
    </div>
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
