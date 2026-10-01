import type { ReactNode } from "react";
import type { Hold } from "@/lib/data";
import { Grade } from "./Route";

// Spray Wall 圈圈的顏色、名稱、大小（直徑佔照片寬度的百分比）
export const HOLD_TYPES = [
  { t: "s", label: "起攀 S", short: "S", color: "var(--hold-start)" },
  { t: "h", label: "路線點", short: "", color: "var(--hold-mid)" },
  { t: "t", label: "完攀 T", short: "T", color: "var(--hold-top)" },
] as const;
export const HOLD_SIZES = [
  { r: 1, label: "小", d: 4.5 },
  { r: 2, label: "中", d: 7 },
  { r: 3, label: "大", d: 10 },
] as const;
const look = (t: Hold["t"]) => HOLD_TYPES.find((x) => x.t === t)!;

// 照片上的圈圈（放在 WallPhoto 裡，跟著照片放大縮小）；onTap 時圈圈可以點（編輯時用來刪除）；mini：縮圖用（細框、不顯示 S／T 字）
export function HoldMarks({ holds, onTap, mini = false }: { holds: Hold[]; onTap?: (i: number) => void; mini?: boolean }) {
  return (
    <>
      {holds.map((h, i) => {
        const k = look(h.t);
        const d = HOLD_SIZES.find((s) => s.r === (h.r ?? 2))!.d;
        const style = {
          left: `${h.x}%`,
          top: `${h.y}%`,
          width: `${d}%`,
          borderColor: k.color,
          transform: "translate(-50%, -50%)",
          boxShadow: mini ? "0 0 0 1px rgba(255,255,255,.85)" : "0 0 0 1.5px rgba(255,255,255,.85), inset 0 0 0 1.5px rgba(255,255,255,.85)",
          borderWidth: mini ? 2 : undefined,
        };
        const label = !mini && k.short && (
          <span
            className="absolute -top-1 -right-1 grid size-[18px] place-items-center rounded-full font-num text-[11px] font-bold text-white"
            style={{ background: k.color, transform: "scale(var(--inv, 1))" }}
          >
            {k.short}
          </span>
        );
        return onTap ? (
          <button
            key={i}
            aria-label={`${k.label}（點一下刪除）`}
            onClick={() => onTap(i)}
            className="absolute aspect-square rounded-full border-[3px]"
            style={style}
          >
            {label}
          </button>
        ) : (
          <span key={i} aria-hidden className="pointer-events-none absolute aspect-square rounded-full border-[3px]" style={style}>
            {label}
          </span>
        );
      })}
    </>
  );
}

// 圈圈圖例
export function HoldLegend() {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-meta text-muted">
      {HOLD_TYPES.map((k) => (
        <span key={k.t} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-3.5 rounded-full border-[3px]" style={{ borderColor: k.color }} />
          {k.label}
        </span>
      ))}
    </div>
  );
}

// 標記工具：選圈圈種類與大小
export function HoldTools({
  type,
  size,
  onType,
  onSize,
}: {
  type: Hold["t"];
  size: 1 | 2 | 3;
  onType: (t: Hold["t"]) => void;
  onSize: (r: 1 | 2 | 3) => void;
}) {
  return (
    <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
      <div className="grid grid-cols-3 gap-1.5">
        {HOLD_TYPES.map((k) => (
          <button
            key={k.t}
            aria-pressed={type === k.t}
            onClick={() => onType(k.t)}
            className="flex items-center justify-center gap-1.5 rounded-field border border-line py-2 text-note font-bold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
          >
            <i className="inline-block size-3.5 rounded-full border-[3px]" style={{ borderColor: k.color }} />
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {HOLD_SIZES.map((s) => (
          <button
            key={s.r}
            aria-pressed={size === s.r}
            aria-label={`圈圈大小：${s.label}`}
            onClick={() => onSize(s.r)}
            className="w-9 rounded-field border border-line text-note aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-surface"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// 路線縮圖：公版照片放大到這條路線的範圍（所有圈圈的外框），顯示圈圈；ratio＝照片高／寬
export function RouteThumb({ src, holds, ratio = 0.75, size = 56 }: { src: string; holds: Hold[]; ratio?: number; size?: number }) {
  const xs = holds.map((h) => h.x);
  const ys = holds.map((h) => h.y);
  const pad = 6;
  const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const bh = (Math.max(...ys) - Math.min(...ys) + pad * 2) * ratio;
  // 放大倍數：讓路線範圍剛好塞進正方形（最少 1 倍、最多 4 倍）
  const s = Math.min(4, Math.max(1, 100 / Math.max(bw, bh, 1)));
  const w = size * s;
  const h = w * ratio;
  const cx = ((Math.min(...xs) + Math.max(...xs)) / 2 / 100) * w;
  const cy = ((Math.min(...ys) + Math.max(...ys)) / 2 / 100) * h;
  const left = Math.min(0, Math.max(size - w, size / 2 - cx));
  const top = Math.min(0, Math.max(size - h, size / 2 - cy));
  return (
    <span aria-hidden className="relative block flex-none overflow-hidden rounded-cell bg-line" style={{ width: size, height: size }}>
      <span className="absolute" style={{ width: w, height: h, left, top }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" draggable={false} className="block size-full select-none" />
        <HoldMarks holds={holds} mini />
      </span>
    </span>
  );
}

// Spray Wall 路線列（列表用）：難度、縮圖、名稱、出題者、完攀人數、讚數
export function SprayRow({
  grade,
  name,
  meta,
  sends,
  likes,
  done,
  thumb,
  onClick,
}: {
  thumb?: ReactNode;
  grade: number;
  name: string;
  meta: ReactNode;
  sends: number;
  likes: number;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-card bg-surface p-3 text-left shadow-card ${done ? "border-l-4 border-accent" : ""}`}
      >
        <Grade grade={grade} className="text-num-row w-[46px]" />
        {thumb}
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sub">{name}</b>
          <span className="block truncate text-meta text-muted">{meta}</span>
        </span>
        <span className="flex-none text-right text-meta text-muted">
          <span className="block">{sends} 人完攀</span>
          <span className="block">👍 {likes}</span>
        </span>
      </button>
    </li>
  );
}
