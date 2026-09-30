"use client";

import { useState } from "react";
import { SectionTitle } from "@/components/ui/Card";
import { DailyBars, StatGrid, StatTile } from "@/components/ui/Stats";
import type { PointsSummary } from "@/lib/data";

// 我的紀錄 → 積分：今天、本月、最高分的一天、連續攀爬；成長比較；每日積分直條圖
export default function PointsPanel({
  year,
  month,
  isNow,
  todayDay,
  summary,
}: {
  year: number;
  month: number;
  isNow: boolean;
  todayDay: number;
  summary: PointsSummary | null;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const s = summary;
  const byDay = s ? Object.fromEntries(Object.entries(s.by_day).map(([d, n]) => [+d, n])) : {};
  const bestDay = s?.best_day ? +s.best_day.day.slice(8, 10) : null;
  const shown = picked ?? (isNow && byDay[todayDay] ? todayDay : bestDay);

  const diffToday = s ? Math.round(s.today - s.avg7) : 0;
  const diffMonth = s ? s.month_total - s.prev_total : 0;
  const pct = s && s.prev_total > 0 ? Math.round((diffMonth / s.prev_total) * 100) : null;

  return (
    <>
      <SectionTitle>積分</SectionTitle>
      <StatGrid>
        <StatTile value={isNow ? (s?.today ?? "–") : "–"} label="今天" />
        <StatTile value={s?.month_total ?? "–"} label="本月" />
        <StatTile value={s?.best_day?.points ?? "–"} label="單日最高" />
        <StatTile value={s ? `${s.streak}` : "–"} label="連續天數" />
      </StatGrid>
      {s && (
        <div className="mt-2.5 grid gap-0.5 text-note text-muted">
          {isNow && (s.today > 0 || s.avg7 > 0) && (
            <p className="m-0">
              今天比最近 7 天平均（{s.avg7} 分）
              {diffToday > 0 ? (
                <>
                  多 <b className="text-accent">{diffToday}</b> 分 ↑
                </>
              ) : diffToday < 0 ? (
                `少 ${-diffToday} 分`
              ) : (
                "一樣"
              )}
            </p>
          )}
          {(s.month_total > 0 || s.prev_total > 0) && (
            <p className="m-0">
              本月比上個月
              {diffMonth > 0 ? (
                <>
                  多 <b className="text-accent">{diffMonth}</b> 分{pct != null ? `（+${pct}%）` : ""} ↑
                </>
              ) : diffMonth < 0 ? (
                `少 ${-diffMonth} 分${pct != null ? `（${pct}%）` : ""}`
              ) : (
                "一樣"
              )}
            </p>
          )}
        </div>
      )}
      <div className="mt-3.5 rounded-tile bg-surface px-3.5 pt-3 pb-2.5 shadow-card">
        <p className="mt-0 mb-2 flex items-baseline justify-between text-meta text-muted">
          <span>每日積分</span>
          {shown != null && (
            <span>
              {month}/{shown}　
              <b className="font-num text-[17px] text-ink">{byDay[shown] ?? 0}</b> 分
            </span>
          )}
        </p>
        <DailyBars year={year} month={month} points={byDay} today={isNow ? todayDay : undefined} selected={shown} onSelect={setPicked} />
      </div>
    </>
  );
}
