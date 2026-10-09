"use client";

import type { ReactNode } from "react";
import { GYM_COLORS, gymShort } from "@/lib/gyms";
import { addDays, dayDiff, inkOn, newRoutesText, resetPhase, resetRange, resetWeekdays, type ResetEvent } from "@/lib/resets";
import { NewBadge } from "./Route";

// 換線日一列：左邊日期（下面星期幾），中間名稱和說明，右邊放按鈕或倒數
export function ResetDateRow({ e, title, sub, aside, dim = false }: { e: ResetEvent; title?: ReactNode; sub?: ReactNode; aside?: ReactNode; dim?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 bg-surface px-4 py-3 ${dim ? "text-muted" : ""}`}>
      <span className="w-[76px] flex-none">
        <b className="block font-num text-[17px] leading-tight font-bold">{resetRange(e)}</b>
        <small className="text-tiny text-muted">{resetWeekdays(e)}</small>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{title ?? e.label}</span>
        {sub && <small className="block truncate text-meta text-muted">{sub}</small>}
      </span>
      {aside}
    </div>
  );
}

// 選館頁每間館名字下面的換線小字：換線中、剛換好（7 天內，NEW）、之後的換線（7 天內橘色，最多兩筆；比較久以後的只寫一筆、灰色）
export function ResetLines({ events, today }: { events: ResetEvent[]; today: string }) {
  const sorted = [...events].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const ongoing = sorted.filter((e) => resetPhase(e, today).phase === "ongoing");
  const fresh = sorted.filter((e) => resetPhase(e, today).phase === "fresh");
  const upcoming = sorted.filter((e) => resetPhase(e, today).phase === "upcoming");
  const soon = upcoming.filter((e) => dayDiff(today, e.starts_on) <= 7).slice(0, 2);
  const next = soon.length ? soon : upcoming.slice(0, 1);
  if (!ongoing.length && !fresh.length && !next.length) return null;
  return (
    <span className="mt-0.5 grid gap-px text-meta leading-snug font-normal">
      {ongoing.map((e) => (
        <span key={e.id} className="text-warn">
          <b>換線中</b>・{e.label}（{e.ends_on === today ? "今晚起新路線" : newRoutesText(e)}）
        </span>
      ))}
      {fresh.length > 0 && (
        <span className="flex items-center text-muted">
          <span className="min-w-0 truncate">{fresh.map((e) => e.label).join("、")} 新路線</span>
          <NewBadge />
        </span>
      )}
      {next.map((e) => {
        const d = dayDiff(today, e.starts_on);
        return (
          <span key={e.id} className="text-muted">
            <b className={d <= 7 ? "text-warn" : "font-normal"}>{d === 0 ? "今天換線" : `${d} 天後換線`}</b>・{e.label} {resetRange(e)}
          </span>
        );
      })}
    </span>
  );
}

// 館的顏色色票（行事曆篩選、說明用）
export function GymDot({ gymId }: { gymId: string }) {
  return <i aria-hidden className="inline-block size-2.5 flex-none rounded-full" style={{ background: GYM_COLORS[gymId] }} />;
}

const WEEK_HEAD = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];

// 換線行事曆（像手機月曆）：一列一週，換線那幾天畫成館的顏色長條（兩天就跨兩格），點日期或長條看那天的細節
export function ResetMonth({
  month,
  events,
  gymName,
  today,
  selected,
  onSelect,
}: {
  month: string; // 2026-10
  events: ResetEvent[];
  gymName: (id: string) => string;
  today: string;
  selected: string | null;
  onSelect: (day: string) => void;
}) {
  const first = `${month}-01`;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -lead);
  const last = addDays(addDays(first, 31).slice(0, 7) + "-01", -1);
  const weeks = Math.ceil((lead + dayDiff(first, last) + 1) / 7);
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-line text-center text-tiny text-muted">
        {WEEK_HEAD.map((w) => (
          <span key={w} className="py-1.5">
            {w}
          </span>
        ))}
      </div>
      {Array.from({ length: weeks }, (_, w) => {
        const ws = addDays(start, w * 7);
        const we = addDays(ws, 6);
        // 這一週的換線：照開始日排，放進不重疊的行（lane）
        const inWeek = events.filter((e) => e.ends_on >= ws && e.starts_on <= we).sort((a, b) => a.starts_on.localeCompare(b.starts_on) || b.ends_on.localeCompare(a.ends_on));
        const lanes: string[] = [];
        const placed = inWeek.map((e) => {
          const s = e.starts_on < ws ? ws : e.starts_on;
          const t = e.ends_on > we ? we : e.ends_on;
          let lane = lanes.findIndex((end) => end < s);
          if (lane < 0) lane = lanes.length;
          lanes[lane] = t;
          return { e, col: dayDiff(ws, s) + 1, span: dayDiff(s, t) + 1, lane, cutL: e.starts_on < ws, cutR: e.ends_on > we };
        });
        return (
          <div key={ws} className="relative grid min-h-[68px] grid-cols-7 content-start gap-y-[3px] border-b border-line pb-1.5 last:border-b-0" style={{ gridTemplateRows: `30px repeat(${lanes.length}, 18px)` }}>
            {Array.from({ length: 7 }, (_, d) => {
              const day = addDays(ws, d);
              const isSel = day === selected;
              return (
                <button
                  key={day}
                  aria-label={`${+day.slice(5, 7)} 月 ${+day.slice(8, 10)} 日`}
                  aria-pressed={isSel}
                  onClick={() => onSelect(day)}
                  className={`absolute inset-y-0 z-0 ${isSel ? "bg-sunk" : ""}`}
                  style={{ left: `${(d / 7) * 100}%`, width: `${100 / 7}%` }}
                />
              );
            })}
            {Array.from({ length: 7 }, (_, d) => {
              const day = addDays(ws, d);
              const inMonth = day.slice(0, 7) === month;
              const isToday = day === today;
              return (
                <span key={day} className="pointer-events-none z-10 flex justify-center pt-1" style={{ gridColumn: d + 1, gridRow: 1 }}>
                  <span
                    className={`grid size-[24px] place-items-center rounded-full font-num text-[15px] font-semibold ${
                      isToday ? "bg-accent text-surface" : inMonth ? "" : "text-muted opacity-50"
                    }`}
                  >
                    {+day.slice(8, 10)}
                  </span>
                </span>
              );
            })}
            {placed.map(({ e, col, span, lane, cutL, cutR }) => {
              const bg = GYM_COLORS[e.gym_id] ?? "#888";
              return (
                <button
                  key={e.id + ws}
                  onClick={() => onSelect(e.starts_on < ws ? ws : e.starts_on)}
                  aria-label={`${gymName(e.gym_id)} ${e.label} ${resetRange(e)} 換線`}
                  className={`z-10 mx-px truncate px-1 text-left text-[11px] leading-[18px] font-bold ${cutL ? "" : "rounded-l-tape"} ${cutR ? "" : "rounded-r-tape"}`}
                  style={{ gridColumn: `${col} / span ${span}`, gridRow: lane + 2, background: bg, color: inkOn(bg) }}
                >
                  {/* 只有一天的格子窄：只寫名稱（館看顏色），兩天以上才連館名 */}
                  {span > 1 ? `${gymShort(gymName(e.gym_id))} ${e.label}` : e.label}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
