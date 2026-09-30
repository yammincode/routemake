"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle } from "@/components/ui/Card";
import { RouteList, RouteRow } from "@/components/ui/Route";
import { CalendarHeat, Delta, GradeBars, MonthSwitcher, StatGrid, StatTile, TotalRow } from "@/components/ui/Stats";
import {
  getGym,
  getGymActiveRoutes,
  getMonthAscents,
  getMonthlyStats,
  getMyAscents,
  type Ascent,
  type Gym,
  type MonthAscent,
  type MonthStats,
  type Route,
} from "@/lib/data";
import { todayYmd } from "@/lib/date";
import { FEEL, GRADE_FEEL } from "@/lib/design";

const thisMonth = () => {
  const t = todayYmd();
  return { y: +t.slice(0, 4), m: +t.slice(5, 7), d: +t.slice(8, 10) };
};

// 我的紀錄：月份切換、四格統計、攀爬日月曆、難度分布、本月完攀與心得、累計、牆上進度
export default function MeView({ gymId }: { gymId: string }) {
  const { session, ready } = useAuth();
  const now = thisMonth();
  const [ym, setYm] = useState({ y: now.y, m: now.m });
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [list, setList] = useState<MonthAscent[]>([]);
  const [wall, setWall] = useState<{ routes: Route[]; mine: Record<string, Ascent> } | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MonthAscent | null>(null);
  const uid = session?.user.id;

  const loadMonth = useCallback(async () => {
    if (!uid) return;
    try {
      const [s, l] = await Promise.all([getMonthlyStats(ym.y, ym.m), getMonthAscents(ym.y, ym.m)]);
      setStats(s);
      setList(l);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [uid, ym.y, ym.m]);

  const loadWall = useCallback(async () => {
    if (!uid) return;
    try {
      const [g, routes] = await Promise.all([getGym(gymId), getGymActiveRoutes(gymId)]);
      setGym(g);
      setWall({ routes, mine: await getMyAscents(routes.map((r) => r.id)) });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [uid, gymId]);

  useEffect(() => {
    if (ready) void Promise.resolve().then(loadMonth);
  }, [ready, loadMonth]);
  useEffect(() => {
    if (ready) void Promise.resolve().then(loadWall);
  }, [ready, loadWall]);

  if (!ready || !session) return null;
  if (error && !stats)
    return (
      <>
        <Empty>{error}</Empty>
        <div className="mt-3">
          <Button onClick={() => void (loadMonth(), loadWall())}>重新整理</Button>
        </div>
      </>
    );

  const isNow = ym.y === now.y && ym.m === now.m;
  const prev = () => setYm(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }));
  const next = () => setYm(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }));

  const byGrade = stats ? Object.entries(stats.by_grade).map(([g, n]) => ({ g: +g, n })).sort((a, b) => a.g - b.g) : [];
  const maxN = Math.max(1, ...byGrade.map((x) => x.n));
  const counts = stats ? Object.fromEntries(Object.entries(stats.by_day).map(([d, n]) => [+d, n])) : {};

  const done = (id: string) => ["flash", "send"].includes(wall?.mine[id]?.status ?? "");
  const wallGrades = wall ? [...new Set(wall.routes.map((r) => r.grade))].sort((a, b) => a - b) : [];

  const feelEmoji = (v: number | null) => FEEL.find((o) => o.v === v)?.e ?? "";
  const gradeFeel = (v: number | null) => GRADE_FEEL.find((o) => o.v === v)?.t;

  return (
    <>
      <MonthSwitcher year={ym.y} month={ym.m} onPrev={prev} onNext={next} nextDisabled={isNow} />
      <StatGrid>
        <StatTile value={stats?.sends ?? "–"} label="完攀" />
        <StatTile value={stats?.flashes ?? "–"} label="Flash" flash />
        <StatTile value={stats?.days ?? "–"} label="攀爬天數" />
        <StatTile value={stats?.top_grade == null ? "–" : `V${stats.top_grade}`} label="最高難度" />
      </StatGrid>
      {stats && (stats.sends > 0 || stats.prev_sends > 0) && <Delta diff={stats.sends - stats.prev_sends} />}

      <SectionTitle>攀爬日</SectionTitle>
      <CalendarHeat year={ym.y} month={ym.m} counts={counts} today={isNow ? now.d : undefined} />

      <SectionTitle>本月難度分布</SectionTitle>
      {byGrade.length ? (
        <GradeBars rows={byGrade.map(({ g, n }) => ({ grade: g, ratio: n / maxN, label: `${n} 條` }))} />
      ) : (
        <Empty>這個月還沒有完攀紀錄。</Empty>
      )}

      {list.length > 0 && (
        <>
          <SectionTitle>本月完攀與心得</SectionTitle>
          <RouteList>
            {list.map((a) => {
              const gf = gradeFeel(a.grade_feel);
              return (
                <RouteRow
                  key={a.id}
                  color={a.route.hold_color}
                  grade={a.route.grade}
                  title={
                    <>
                      {a.route.zone_name} {a.route.hold_color}色 {feelEmoji(a.feel)}
                    </>
                  }
                  meta={`${+a.climbed_on.slice(5, 7)}/${+a.climbed_on.slice(8, 10)}${gf ? `，體感${gf}` : ""}${a.route.archived_at ? "，已下架" : ""}`}
                  quote={a.private_note ?? undefined}
                  status={a.status}
                  statusOld={!!a.route.archived_at}
                  onClick={() => setOpen(a)}
                />
              );
            })}
          </RouteList>
        </>
      )}

      <TotalRow label="累計完攀" value={stats?.total_sends ?? "–"} />

      <SectionTitle>目前牆上進度</SectionTitle>
      {wall && wallGrades.length ? (
        <GradeBars
          rows={wallGrades.map((g) => {
            const rs = wall.routes.filter((r) => r.grade === g);
            const d = rs.filter((r) => done(r.id)).length;
            return { grade: g, ratio: d / rs.length, label: `${d}/${rs.length}` };
          })}
        />
      ) : (
        <Empty>{wall ? "牆上目前沒有路線。" : "讀取中…"}</Empty>
      )}

      <RouteSheet
        route={open?.route ?? null}
        zoneName={open?.route.zone_name ?? ""}
        gymId={open?.route.gym_id ?? gymId}
        gymCommentsOn={gym?.comments_enabled ?? true}
        ascent={open}
        onClose={() => setOpen(null)}
        onSaved={() => void (loadMonth(), loadWall())}
      />
    </>
  );
}
