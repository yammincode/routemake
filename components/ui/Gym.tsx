"use client";

import type { ComponentProps, CSSProperties, KeyboardEvent, ReactNode } from "react";
import { GRADE_BANDS, GRADES, gradeColor, gradeLabel, inBand, type BandId, type GradeBand, type HoldColor } from "@/lib/design";
import { Button } from "./Button";
import Icon from "./Icon";
import { HoldDot, NewBadge } from "./Route";

// 區域卡片上的換線：days 是離開始還有幾天（換線中是 0）
export type ZoneReset = { days: number; ongoing: boolean; text: string; warn: boolean };

// 換線倒數文字
export function dueText(days: number | null) {
  if (days == null) return "";
  return days < 0 ? "換線日已過" : days === 0 ? "今天換線" : `${days} 天後換線`;
}

// 膠帶色塊：有顏色的用館內膠帶色（加一圈細框，深色模式下黑色膠帶也看得到）；還沒定顏色（V9、V10）和上攀用虛線框
const TAPE_EDGE = "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_30%,transparent)]";
export function tapeLook(g: number): { style?: CSSProperties; cls: string } {
  const c = gradeColor(g);
  return c ? { style: { background: c.bg, color: c.fg }, cls: TAPE_EDGE } : { cls: "border border-dashed border-muted bg-sunk text-ink" };
}

// 每個難度幾條，由易到難
export function countByGrade(grades: number[]): [number, number][] {
  const m = new Map<number, number>();
  for (const g of grades) m.set(g, (m.get(g) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

// 區域難度色帶：同一個難度合成一段、寫條數；所有區域用同一個比例（scale＝路線最多那區的條數），路線多的牆色帶比較長
// 選了難度時，範圍內的段保持粗、寫條數，其他縮成細線
export function GradeStrip({ grades, band, scale }: { grades: number[]; band: GradeBand | null; scale: number }) {
  return (
    <span aria-hidden className="flex h-[18px] items-center gap-[2px]" style={{ width: `${Math.max(12, (grades.length / Math.max(scale, 1)) * 100)}%` }}>
      {countByGrade(grades).map(([g, n]) => {
        const t = tapeLook(g);
        const on = inBand(g, band);
        return (
          <span
            key={g}
            style={{ flex: `${n} 1 0`, ...t.style }}
            className={`flex min-w-0 items-center justify-center rounded-tape font-num text-tiny leading-none font-bold ${t.cls} ${on ? "h-full" : "h-1.5"}`}
          >
            {on ? n : ""}
          </span>
        );
      })}
    </span>
  );
}

// 全館難度分布：VB–V10 各幾條（直條用膠帶顏色）；下面三段難度帶也能點，等於按篩選
export function GradeChart({ grades, band, onBand }: { grades: number[]; band: GradeBand | null; onBand: (b: BandId | null) => void }) {
  const counts = GRADES.map((g) => grades.filter((x) => x === g).length);
  const total = counts.reduce((s, n) => s + n, 0);
  const max = Math.max(1, ...counts);
  const picked = band ? grades.filter((g) => inBand(g, band)).length : total;
  return (
    <div className="rounded-card bg-surface px-4 pt-3.5 pb-3 shadow-card">
      <div className="mb-2 flex items-baseline justify-between">
        <b className="text-note">全館難度分布</b>
        <span className="text-meta text-muted">
          {band ? `${band.range} 共 ` : "共 "}
          <b className="font-num text-num-chip leading-none text-ink">{picked}</b> 條{band ? ` ／ ${total}` : ""}
        </span>
      </div>
      <div className="grid grid-cols-12 items-end gap-1">
        {GRADES.map((g, i) => {
          const t = tapeLook(g);
          return (
            <div key={g} className={`grid justify-items-center gap-0.5 ${inBand(g, band) ? "" : "opacity-40"}`}>
              <span className="font-num text-meta leading-none font-semibold text-muted">{counts[i] || ""}</span>
              <span style={{ height: `${Math.max(4, (counts[i] / max) * 56)}px`, ...t.style }} className={`w-full rounded-tape ${t.cls}`} />
              <span className="font-num text-meta leading-tight font-bold">{gradeLabel(g)}</span>
            </div>
          );
        })}
      </div>
      {/* 三段難度帶：VB–V2 四欄、V3–V5 三欄、V6–V10 五欄 */}
      <div className="mt-1.5 grid grid-cols-12 gap-1">
        {GRADE_BANDS.map((b) => {
          const on = band?.id === b.id;
          return (
            <button
              key={b.id}
              aria-pressed={on}
              onClick={() => onBand(on ? null : b.id)}
              className={`border-t-2 pt-0.5 text-center text-tiny ${b.id === "easy" ? "col-span-4" : b.id === "mid" ? "col-span-3" : "col-span-5"} ${
                on ? "border-ink font-bold text-ink" : "border-line text-muted"
              }`}
            >
              {b.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 難度篩選：全部／入門／進階／挑戰四格一排（360 寬也放得下），每格是三段小色條＋名稱、下面是難度範圍
export function BandPicker({ value, onChange }: { value: BandId | null; onChange: (b: BandId | null) => void }) {
  const opts = [{ id: null, name: "全部", range: "VB–V10", swatch: [] as number[] }, ...GRADE_BANDS];
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {opts.map((o) => (
        <button
          key={o.id ?? "all"}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className="group grid justify-items-center gap-1 rounded-field border border-line bg-surface px-0.5 pt-2 pb-1.5 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg"
        >
          <span className="flex items-center gap-1.5 text-note leading-none font-bold">
            {o.swatch.length > 0 && (
              <span className="flex gap-[2px]">
                {o.swatch.map((g) => {
                  const t = tapeLook(g);
                  // 選中時底色是 ink，黑色、螢光黃膠帶要換成淺色細框才看得到
                  return (
                    <span
                      key={g}
                      style={t.style}
                      className={`h-3.5 w-[5px] rounded-tape ${t.cls} group-aria-pressed:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--bg)_70%,transparent)]`}
                    />
                  );
                })}
              </span>
            )}
            {o.name}
          </span>
          <span className="font-num text-sub leading-none font-semibold text-muted group-aria-pressed:text-bg">{o.range}</span>
        </button>
      ))}
    </div>
  );
}

// 區域卡片（難度色帶）：小縮圖｜區名（3 天內有新路線加 NEW）、完成數｜難度色帶｜難度範圍或篩選結果、換線倒數
// total 是牆上條數（跟平面圖同一個來源）；grades 只用來畫色帶和難度範圍，還沒拿到（舊版存在手機的資料）就先不畫，不會寫成「還沒有路線」
// guest：沒登入只寫條數；band：選了難度時，這區沒有那個難度就變淡
// 縮圖載入失敗（舊照片還沒有縮圖）就改用原圖
// 照片載入失敗：縮圖還沒產生就改用原圖；最後再不用 crossOrigin 重抓一次（照樣看得到，只是不會存進離線快取）
// 照片加 crossOrigin="anonymous" 是為了讓 Service Worker 能把照片存進手機（沒加的話回應看不到內容，快取不會存）
export function imgFallback(img: HTMLImageElement, fallback?: string) {
  if (fallback && img.src !== fallback) img.src = fallback;
  else if (img.hasAttribute("crossorigin")) {
    img.removeAttribute("crossorigin");
    img.src = img.src;
  }
}

export function ZoneCard({
  photo,
  fallback,
  name,
  done,
  total,
  grades,
  scale,
  band = null,
  guest = false,
  fresh = false,
  due,
  ...rest
}: ComponentProps<"button"> & {
  photo: string;
  fallback?: string;
  name: string;
  done: number;
  total: number;
  grades: number[];
  scale: number;
  band?: GradeBand | null;
  guest?: boolean;
  fresh?: boolean;
  due: ZoneReset | null; // 換線：「10/19–20 換線・10 天後」「換線中・今晚起新路線」（7 天內 warn）
}) {
  const known = grades.length > 0;
  const hit = band ? grades.filter((g) => inBand(g, band)).length : grades.length;
  const dim = band != null && known && hit === 0;
  const clear = !guest && total > 0 && done >= total;
  const lo = known ? gradeLabel(Math.min(...grades)) : "";
  const hi = known ? gradeLabel(Math.max(...grades)) : "";
  const range = lo === hi ? lo : `${lo}–${hi}`;
  const detail = !known ? "" : band ? (hit ? `${band.range} 有 ${hit} 條` : `沒有 ${band.range}`) : `難度 ${range}`;
  return (
    <button
      aria-label={[name, fresh && "有新路線", guest ? `牆上 ${total} 條` : `完成 ${done} / ${total}`, detail, due?.text].filter(Boolean).join("，")}
      className="flex w-full items-center gap-3 rounded-card bg-surface p-2.5 text-left shadow-card"
      {...rest}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={photo}
        src={photo}
        alt=""
        loading="lazy"
        crossOrigin="anonymous"
        onError={(e) => imgFallback(e.currentTarget, fallback)}
        className={`size-[68px] flex-none rounded-field bg-line object-cover ${dim ? "opacity-40 grayscale" : ""}`}
      />
      <span className="grid min-w-0 flex-1 gap-[7px]">
        <span className="flex items-center justify-between gap-2">
          <span className={`flex min-w-0 items-center truncate text-section leading-tight font-bold ${dim ? "text-muted" : ""}`}>
            {name}
            {fresh && <NewBadge />}
          </span>
          <span className={`inline-flex flex-none items-center gap-0.5 font-num text-[16px] leading-none font-semibold ${clear ? "text-accent" : "text-muted"}`}>
            {clear && <Icon name="send" className="size-4" />}
            {guest ? `${total} 條` : `${done} / ${total}`}
          </span>
        </span>
        {known ? (
          <GradeStrip grades={grades} band={band} scale={scale} />
        ) : (
          <span className="text-meta leading-[18px] text-muted">{total ? "" : "還沒有路線"}</span>
        )}
        <span className="flex items-center justify-between gap-2 text-meta leading-none">
          {!known ? (
            <span />
          ) : band == null ? (
            <span className="font-num text-sub leading-none font-semibold text-muted">{range}</span>
          ) : dim ? (
            <span className="text-muted">沒有 {band.range}</span>
          ) : (
            <span className="font-bold text-accent">
              {band.range} 有 <span className="font-num text-sub leading-none">{hit}</span> 條
            </span>
          )}
          <span className={`flex-none ${due?.warn ? "font-bold text-warn" : "text-muted"}`}>{due?.text}</span>
        </span>
      </span>
    </button>
  );
}

export function ZoneList({ children }: { children: ReactNode }) {
  return <div className="grid gap-2.5">{children}</div>;
}

// 提醒（例如 7 天內要換線的區）：上面小標、下面一句話，點了進那一區；360 寬的手機也不會斷句
export function GoalLine({ label, children, ...rest }: ComponentProps<"button"> & { label: string }) {
  return (
    <button className="relative mt-3 flex w-full items-center gap-2.5 overflow-hidden rounded-btn bg-surface py-2.5 pr-3 pl-4 text-left shadow-card" {...rest}>
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      <span className="grid min-w-0 flex-1">
        <span className="text-meta font-bold text-accent">{label}</span>
        <span className="text-note">{children}</span>
      </span>
      <span aria-hidden className="-mt-1 flex-none text-sheet leading-none text-accent">
        ›
      </span>
    </button>
  );
}

// 最新路線橫向卡片（原型 .newcard）
export function NewRouteRow({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pt-0.5 pb-2">{children}</div>;
}
// color 不給：長耐力路線（不分顏色）不畫色點
export function NewRouteCard({ color, grade, zone, ago, ...rest }: ComponentProps<"button"> & { color?: HoldColor; grade: number; zone: string; ago: string }) {
  return (
    <button className="w-[118px] flex-none rounded-tile bg-surface p-3 text-left shadow-card" {...rest}>
      <span className="mb-1.5 flex items-center gap-2 font-num text-num-card font-bold">
        {color && <HoldDot color={color} />}
        {gradeLabel(grade)}
      </span>
      <small className="block text-meta leading-[1.4] text-muted">
        {zone}
        <br />
        {ago}設定
      </small>
    </button>
  );
}

// 場館選擇列（原型 .gymrow）
// tag：右邊的小字（預設「已上線／即將上線」）
// lines：館名下面的小字（選館頁的換線資訊）；tag 給空字串就不顯示右邊的字
export function GymRow({
  name,
  live,
  selected,
  logo,
  tag,
  lines,
  ...rest
}: ComponentProps<"button"> & { name: string; live: boolean; selected: boolean; logo?: string; tag?: string; lines?: ReactNode }) {
  const right = tag ?? (live ? "已上線" : "即將上線");
  return (
    <button
      aria-pressed={selected}
      className={`flex w-full items-center justify-between gap-2 rounded-btn bg-sunk px-4 text-left font-medium aria-pressed:shadow-[inset_0_0_0_2px_var(--ink)] ${logo ? "py-2.5" : "py-3.5"}`}
      {...rest}
    >
      <span className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img src={logo} alt="" width={48} height={48} className={`size-12 flex-none ${live ? "" : "opacity-60 grayscale-[40%]"}`} />}
        <span className="grid min-w-0">
          {name}
          {lines}
        </span>
      </span>
      {right && <small className={`flex-none text-meta ${live ? "font-bold text-accent" : "font-normal text-muted"}`}>{right}</small>}
    </button>
  );
}

// 即將上線（原型 .soon-box）
export function SoonBox({ name, onBack, backLabel }: { name: string; onBack: () => void; backLabel: string }) {
  return (
    <div className="rounded-plan bg-surface px-6 py-10 text-center shadow-card">
      <strong className="mb-1.5 block text-sheet">{name}即將上線</strong>
      <p className="mt-0 mb-5 text-muted">路線資料建置中，完成後就能在這裡看路線、記錄完攀。</p>
      <Button variant="primary" className="mx-auto max-w-[220px]" onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  );
}

// 鍵盤操作：Enter / 空白鍵等同點擊
export const pressKeys = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};
