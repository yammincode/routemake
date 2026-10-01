import type { ReactNode } from "react";
import { ABILITY_AXES } from "@/lib/design";

// 頭像：暱稱第一個字（不上傳照片，避免被認出本人）
export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="grid flex-none place-items-center rounded-full bg-accent-soft font-black text-accent"
    >
      {Array.from(name.trim())[0] ?? "?"}
    </span>
  );
}

// 六角形能力表：actual 0–100（依完攀計算，實心）、self 1–5（自評，虛線）
export function HexChart({ actual, self }: { actual?: number[] | null; self?: number[] | null }) {
  const cx = 130;
  const cy = 118;
  const R = 78;
  const pt = (i: number, r: number) => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, (R * Math.max(0, Math.min(100, v))) / 100).join(",")).join(" ");
  return (
    <div>
      <svg viewBox="0 0 260 240" role="img" aria-label="能力六角形" className="mx-auto block h-auto w-full max-w-[300px]">
        {[1, 2 / 3, 1 / 3].map((k) => (
          <polygon key={k} points={poly(ABILITY_AXES.map(() => k * 100))} fill="none" stroke="var(--line)" strokeWidth={1.5} />
        ))}
        {ABILITY_AXES.map((_, i) => {
          const [x, y] = pt(i, R);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
        })}
        {actual && actual.some((v) => v > 0) && (
          <polygon points={poly(actual)} fill="var(--accent)" fillOpacity={0.3} stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        )}
        {self && <polygon points={poly(self.map((v) => v * 20))} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray="6 5" strokeLinejoin="round" />}
        {ABILITY_AXES.map((label, i) => {
          const [x, y] = pt(i, R + 20);
          return (
            <text key={label} x={x} y={y + 5} fontSize={14} textAnchor="middle" className="fill-muted font-bold">
              {label}
            </text>
          );
        })}
      </svg>
      <div className="flex justify-center gap-4 text-tiny text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm border-2 border-accent bg-accent-soft" />依完攀路線
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-0 w-4 border-t-2 border-dashed border-ink" />自評
        </span>
      </div>
    </div>
  );
}

// 人物卡內容：頭像、暱稱、一行基本資料、自我介紹、能力表、數字
export function ProfileCardView({
  name,
  meta,
  bio,
  chart,
  stats,
  children,
}: {
  name: string;
  meta?: ReactNode;
  bio?: string | null;
  chart?: ReactNode;
  stats?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={name} size={52} />
        <div className="min-w-0">
          <h2 className="m-0 truncate text-sheet font-bold">{name}</h2>
          {meta && <p className="m-0 text-note text-muted">{meta}</p>}
        </div>
      </div>
      {bio && <p className="mt-3 mb-0 rounded-btn bg-sunk px-3 py-2.5 text-sub leading-normal break-words">{bio}</p>}
      {chart && <div className="mt-3">{chart}</div>}
      {stats && <div className="mt-2 text-center text-note text-muted">{stats}</div>}
      {children}
    </div>
  );
}
