"use client";

import { useCallback, useEffect, useState } from "react";
import LogDayView from "@/components/me/LogDay";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { ProjectCard, WeekCard } from "@/components/ui/Training";
import { getClimbDays, getMyProjects, getTrainingDays, type ClimbDayRow, type PointsSummary, type Project, type TrainingDay } from "@/lib/data";
import { daysUntil, todayYmd } from "@/lib/date";
import { gradeLabel } from "@/lib/design";
import { findGym, gymShort } from "@/lib/gyms";
import { withCache } from "@/lib/offline";
import { groupDays, isoDow, PROJECT_WARN_DAYS, weekStart } from "@/lib/training";

export const projectDue = (p: Pick<Project, "reset_on">) => {
  const n = daysUntil(p.reset_on);
  if (n == null || n < 0) return { text: null, warn: false, days: null };
  return { text: n === 0 ? "今天換線" : `${n} 天後換線`, warn: n <= PROJECT_WARN_DAYS, days: n };
};
const projectWhere = (p: Project) => `${gymShort(findGym(p.gym_id)?.name ?? p.gym_id)} ${p.zone_name}${p.name ? `・${p.name}` : p.holds_n ? ` ${p.code}` : ` ${p.hold_color}色`}`;
const projectDetail = (p: Project) =>
  [`來了 ${Math.max(1, p.days)} 天`, p.tries ? `試了 ${p.tries} 次` : null, p.holds_n && p.highpoint ? `最高到第 ${p.highpoint}／${p.holds_n} 點` : null].filter(Boolean).join("・");

// 這週：目標圈（目標幾天、連續週數、這週每天）→ 我的專案（換線倒數，前 3 天變橘色）→ 今天的日誌
export default function WeekTab({
  uid,
  goal,
  summary,
  cardPublic,
  version,
  onGoal,
  onRoute,
  onProjects,
  onDiary,
}: {
  uid: string;
  goal: number;
  summary: PointsSummary | null;
  cardPublic: boolean | null;
  version: number; // 紀錄改了（路線卡片存好、離線的送出了）就加 1，重讀
  onGoal: (n: number) => void;
  onRoute: (routeId: string) => void;
  onProjects?: (ps: Project[]) => void;
  onDiary?: (t: TrainingDay) => void; // 寫了日誌：這個月的月曆黃點跟著更新
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [climbs, setClimbs] = useState<ClimbDayRow[] | null>(null);
  const [diary, setDiary] = useState<TrainingDay | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editGoal, setEditGoal] = useState(false);
  const today = todayYmd();
  const w0 = weekStart(today);

  const load = useCallback(async () => {
    type Data = { p: Project[]; c: ClimbDayRow[]; d: Record<string, TrainingDay> };
    const apply = (x: Data) => {
      setProjects(x.p);
      setClimbs(x.c);
      setDiary(x.d[today] ?? null);
      onProjects?.(x.p);
    };
    try {
      const { data } = await withCache<Data>(
        `week:${uid}:${w0}`,
        async () => {
          const [p, c, d] = await Promise.all([getMyProjects(), getClimbDays(uid, { from: w0, to: today }), getTrainingDays(uid, today, today)]);
          return { p, c, d };
        },
        apply
      );
      apply(data);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [uid, w0, today, onProjects]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load, version]);

  const sends = climbs ? climbs.filter((c) => c.status !== "project" && c.route.kind !== "community").length : null;
  const todayDay = groupDays((climbs ?? []).filter((c) => c.day === today), diary ? { [today]: diary } : {})[0] ?? { day: today, climbs: [], diary: null, milestones: [] };

  return (
    <>
      <WeekCard
        goal={goal}
        days={summary?.week_days ?? []}
        today={isoDow(today)}
        streak={summary?.week_streak ?? 0}
        sends={sends}
        points={summary?.week ?? null}
        editing={editGoal}
        onEdit={() => setEditGoal(!editGoal)}
        onGoal={(n) => {
          setEditGoal(false);
          onGoal(n);
        }}
      />
      <SectionTitle>我的專案</SectionTitle>
      {err && !projects ? (
        <Empty>{err}</Empty>
      ) : !projects ? (
        <Empty>讀取中…</Empty>
      ) : projects.length ? (
        <>
          <ul className="m-0 grid list-none gap-2 p-0">
            {projects.map((p) => {
              const due = projectDue(p);
              return <ProjectCard key={p.route_id} grade={p.grade} color={p.holds_n ? null : p.hold_color} where={projectWhere(p)} due={due.text} warn={due.warn} detail={projectDetail(p)} onClick={() => onRoute(p.route_id)} />;
            })}
          </ul>
          <Tip>嘗試中的路線都在這裡；換線前 {PROJECT_WARN_DAYS} 天會變橘色提醒。點一條打開路線卡片，記今天試了幾次。</Tip>
        </>
      ) : (
        <Empty>還沒有專案。在路線卡片按「嘗試中」，這裡會幫你記來了幾天、試了幾次，快換線會提醒。</Empty>
      )}
      <SectionTitle>今天</SectionTitle>
      {!todayDay.climbs.length && !todayDay.diary && <Tip>還沒記錄。今天記的路線會自動出現在這裡，也可以寫一句話。</Tip>}
      <LogDayView d={todayDay} all={climbs ?? []} userId={uid} editable cardPublic={cardPublic} onRoute={(c) => onRoute(c.route.id)} onDiary={(t) => (setDiary(t), onDiary?.(t))} />
    </>
  );
}

// 夥伴講這週和專案（我的紀錄最上面的泡泡）
export function weekLines(o: { goal: number; days: number; streak: number; projects: Project[] | null }): string[] {
  const out: string[] = [];
  const left = o.goal - o.days;
  if (left === 1) out.push("這週再來一次就達標了！");
  else if (left <= 0 && o.days) out.push(`這週目標 ${o.goal} 天達標了，太強了！`);
  if (o.streak >= 2) out.push(`連續 ${o.streak} 週都有來爬，繼續保持！`);
  for (const p of (o.projects ?? []).filter((x) => projectDue(x).warn).slice(0, 1)) {
    const d = projectDue(p);
    out.push(`專案 ${gradeLabel(p.grade)} ${d.days === 0 ? "今天就換線了" : `還有 ${d.days} 天就換線`}，快去拚！`);
  }
  return out;
}
