"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { BackLink, Empty } from "@/components/ui/Card";
import { Chip, ChipRow, GradeChip } from "@/components/ui/Chip";
import { dueText } from "@/components/ui/Gym";
import { CommentCount, Points, RouteList, RouteRow, Tags } from "@/components/ui/Route";
import { NoPhoto, Pin, WallPhoto } from "@/components/ui/Wall";
import {
  getZoneView,
  photoUrl,
  type Ascent,
  type Gym,
  type Route,
  type Zone,
  type ZoneData,
} from "@/lib/data";
import { ago, daysUntil, isNew } from "@/lib/date";
import { gradeLabel, type HoldColor, STYLE_TAGS } from "@/lib/design";
import { backOr } from "@/lib/nav";
import { overlayPending, withCache } from "@/lib/offline";
import { routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

// 區域頁：照片＋起步點標記、難度／顏色／風格篩選、路線列表
export default function ZoneView({ zoneId }: { zoneId: string }) {
  const { session, ready } = useAuth();
  const router = useRouter();
  const [zone, setZone] = useState<Zone | null>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [ascents, setAscents] = useState<Record<string, Ascent>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [color, setColor] = useState<HoldColor | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<Route | null>(null);
  const rules = useScoring();
  const uid = session?.user.id;

  // 第一次載入時先顯示手機裡上次的資料，抓到最新的再換掉
  const first = useRef(true);
  const load = useCallback(async () => {
    const apply = (data: ZoneData) => {
      setZone(data.z);
      setGym(data.g);
      setRoutes(data.rs);
      setAscents(overlayPending(data.as, uid));
      setCounts(data.cs);
    };
    try {
      const { data } = await withCache(`zone:${zoneId}:${uid ?? "guest"}`, () => getZoneView(zoneId), first.current ? apply : undefined);
      first.current = false;
      apply(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [zoneId, uid]);

  useEffect(() => {
    if (!ready) return;
    void Promise.resolve().then(load);
    window.addEventListener("online", load);
    window.addEventListener("routemake:synced", load);
    return () => {
      window.removeEventListener("online", load);
      window.removeEventListener("routemake:synced", load);
    };
  }, [ready, load]);

  if (error && !zone)
    return (
      <>
        <BackLink onClick={() => backOr(router, "/gyms")}>返回</BackLink>
        <Empty>{error}</Empty>
        <div className="mt-3">
          <Button onClick={load}>重新整理</Button>
        </div>
      </>
    );
  if (!zone || !gym) return <Empty>讀取中…</Empty>;

  const status = (r: Route) => ascents[r.id]?.status ?? null;
  const done = routes.filter((r) => status(r) === "flash" || status(r) === "send").length;
  const match = (r: Route) =>
    (grade == null || r.grade === grade) && (color == null || r.hold_color === color) && (tag == null || r.style_tags.includes(tag));
  const grades = [...new Set(routes.map((r) => r.grade))].sort((a, b) => a - b);
  const colors = [...new Set(routes.map((r) => r.hold_color))];
  const tags = STYLE_TAGS.filter((t) => routes.some((r) => r.style_tags.includes(t)));
  const days = daysUntil(zone.next_reset_on);
  const commentsOn = gym.comments_enabled;
  const src = photoUrl(zone.photo_path);

  return (
    <>
      <BackLink onClick={() => backOr(router, `/gym/${zone.gym_id}`)}>{gym.name}</BackLink>
      <h1 className="mt-1 mb-1.5 text-title font-black">{zone.name}</h1>
      <p className="mt-0 mb-[18px] text-sub text-muted">
        {routes.length} 條路線{session ? `，完成 ${done} 條` : ""}
        {days != null && (
          <>
            ，<span className={days <= 7 ? "font-bold text-warn" : ""}>{dueText(days)}</span>
          </>
        )}
      </p>

      {src ? (
        <WallPhoto src={src} alt={`${zone.name}照片`}>
          {routes.map((r) => {
            const s = status(r);
            return (
              <Pin
                key={r.id}
                x={r.pin_x}
                y={r.pin_y}
                color={r.hold_color}
                grade={r.grade}
                status={s === "project" ? null : s}
                dim={!match(r)}
                label={`${gradeLabel(r.grade)} ${r.hold_color}色 ${r.code}`}
                onClick={() => setOpen(r)}
              />
            );
          })}
        </WallPhoto>
      ) : (
        <NoPhoto>這區的照片還沒上傳</NoPhoto>
      )}

      {routes.length > 0 && (
        <>
          <ChipRow>
            <Chip num pressed={grade == null} onClick={() => setGrade(null)}>
              全部
            </Chip>
            {grades.map((g) => (
              <GradeChip key={g} grade={g} pressed={grade === g} onClick={() => setGrade(g)} />
            ))}
          </ChipRow>
          <ChipRow>
            <Chip pressed={color == null} onClick={() => setColor(null)}>
              所有顏色
            </Chip>
            {colors.map((c) => (
              <Chip key={c} pressed={color === c} onClick={() => setColor(c)}>
                {c}
              </Chip>
            ))}
          </ChipRow>
          {tags.length > 0 && (
            <ChipRow>
              <Chip pressed={tag == null} onClick={() => setTag(null)}>
                所有風格
              </Chip>
              {tags.map((t) => (
                <Chip key={t} pressed={tag === t} onClick={() => setTag(t)}>
                  {t}
                </Chip>
              ))}
            </ChipRow>
          )}
        </>
      )}

      {routes.filter(match).length ? (
        <RouteList>
          {routes.filter(match).map((r) => (
            <RouteRow
              key={r.id}
              color={r.hold_color}
              grade={r.grade}
              title={
                <>
                  {r.hold_color}色 {r.code}
                  {rules && <Points n={routePoints(r.grade, r.style_tags, rules)} />}
                </>
              }
              isNew={isNew(r.created_at)}
              status={status(r)}
              meta={
                <>
                  <Tags tags={r.style_tags} /> {ago(r.created_at)}
                  {commentsOn && r.comments_enabled && (counts[r.id] ?? 0) > 0 && <CommentCount n={counts[r.id]} />}
                </>
              }
              onClick={() => setOpen(r)}
            />
          ))}
        </RouteList>
      ) : (
        <Empty>{routes.length ? "沒有符合的路線。" : "這區目前沒有路線。"}</Empty>
      )}

      <RouteSheet
        route={open}
        zoneName={zone.name}
        gymId={zone.gym_id}
        gymCommentsOn={commentsOn}
        ascent={open ? (ascents[open.id] ?? null) : null}
        onClose={() => {
          setOpen(null);
          void load();
        }}
        onSaved={(a) => open && setAscents((m) => (a ? { ...m, [open.id]: a } : Object.fromEntries(Object.entries(m).filter(([k]) => k !== open.id))))}
      />
    </>
  );
}
