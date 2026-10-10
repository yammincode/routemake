"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import PointsPanel from "@/components/PointsPanel";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle } from "@/components/ui/Card";
import { Points, RouteList, RouteRow } from "@/components/ui/Route";
import { CalendarHeat, Delta, GradeBars, MonthSwitcher, StatGrid, StatTile, TotalRow } from "@/components/ui/Stats";
import {
  getGym,
  getGymActiveRoutes,
  getMonthAscents,
  getMonthlyStats,
  getMyAscents,
  getPointsSummary,
  seqPhotoUrl,
  seqTotal,
  type Ascent,
  type Gym,
  type MonthAscent,
  type MonthStats,
  type PointsSummary,
  type Route,
} from "@/lib/data";
import { todayYmd } from "@/lib/date";
import { FEEL, GRADE_FEEL, gradeLabel } from "@/lib/design";
import { overlayPending, withCache } from "@/lib/offline";
import { ascentPoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

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
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const rules = useScoring();
  const [list, setList] = useState<MonthAscent[]>([]);
  const [wall, setWall] = useState<{ routes: Route[]; mine: Record<string, Ascent> } | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MonthAscent | null>(null);
  const uid = session?.user.id;

  // 第一次載入時先顯示手機裡上次的資料，抓到最新的再換掉
  const firstMonth = useRef(true);
  const firstWall = useRef(true);
  const loadMonth = useCallback(async () => {
    if (!uid) return;
    type Data = { s: MonthStats; l: MonthAscent[]; p: PointsSummary | null };
    const apply = (data: Data) => {
      setStats(data.s);
      setList(data.l);
      setPoints(data.p ?? null);
    };
    try {
      const { data } = await withCache<Data>(
        `me:${uid}:${ym.y}-${ym.m}`,
        async () => {
          const [s, l, p] = await Promise.all([getMonthlyStats(ym.y, ym.m), getMonthAscents(ym.y, ym.m), getPointsSummary(ym.y, ym.m)]);
          return { s, l, p };
        },
        firstMonth.current ? apply : undefined
      );
      firstMonth.current = false;
      apply(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [uid, ym.y, ym.m]);

  const loadWall = useCallback(async () => {
    if (!uid) return;
    type Data = { g: Gym; routes: Route[]; mine: Record<string, Ascent> };
    const apply = (data: Data) => {
      setGym(data.g);
      setWall({ routes: data.routes, mine: overlayPending(data.mine, uid) });
    };
    try {
      const { data } = await withCache<Data>(
        `wall:${uid}:${gymId}`,
        async () => {
          const [g, routes] = await Promise.all([getGym(gymId), getGymActiveRoutes(gymId)]);
          return { g, routes, mine: await getMyAscents(routes.map((r) => r.id)) };
        },
        firstWall.current ? apply : undefined
      );
      firstWall.current = false;
      apply(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [uid, gymId]);

  useEffect(() => {
    if (!ready) return;
    void Promise.resolve().then(loadMonth);
    window.addEventListener("routemake:synced", loadMonth);
    return () => window.removeEventListener("routemake:synced", loadMonth);
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
        <StatTile
          value={stats?.top_grade != null ? gradeLabel(stats.top_grade) : stats?.top_yds != null ? gradeLabel(stats.top_yds) : "–"}
          label={stats?.top_grade != null && stats?.top_yds != null ? `最高（上攀 ${gradeLabel(stats.top_yds)}）` : "最高難度"}
        />
      </StatGrid>
      {stats && (stats.sends > 0 || stats.prev_sends > 0) && <Delta diff={stats.sends - stats.prev_sends} />}

      <PointsPanel year={ym.y} month={ym.m} isNow={isNow} todayDay={now.d} summary={points} />

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
              // 長耐力：不分顏色，寫爬到第幾點（沒爬完的照比例有分數）
              const n = seqTotal(a.route);
              const hp = n ? (a.status === "project" ? a.highpoint : n) : null;
              return (
                <RouteRow
                  key={a.id}
                  color={n ? undefined : a.route.hold_color}
                  grade={a.route.grade}
                  title={
                    <>
                      {a.route.name ? `${a.route.zone_name}・${a.route.name}` : n ? `${a.route.zone_name} ${a.route.code}` : `${a.route.zone_name} ${a.route.hold_color}色`}{" "}
                      {feelEmoji(a.feel)}
                      {rules && a.route.kind !== "community" && <Points prefix="+" n={ascentPoints(a.route.grade, a.route.style_tags, a.status, rules, hp, n)} />}
                    </>
                  }
                  meta={`${+a.climbed_on.slice(5, 7)}/${+a.climbed_on.slice(8, 10)}${hp ? `，爬到 ${hp}／${n} 點` : ""}${gf ? `，體感${gf}` : ""}${a.route.archived_at ? "，已下架" : ""}`}
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
        photo={open && seqTotal(open.route) ? seqPhotoUrl(open.route, open.route.zone_photo ?? null) : null}
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
