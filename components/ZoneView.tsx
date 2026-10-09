"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { BackLink, Empty } from "@/components/ui/Card";
import { Chip, ChipRow, GradeChip } from "@/components/ui/Chip";
import { HowTo } from "@/components/ui/HowTo";
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
import { gradeColor, gradeLabel, type HoldColor, STYLE_TAGS } from "@/lib/design";
import { backOr, upTo } from "@/lib/nav";
import { overlayPending, peekCache, withCache } from "@/lib/offline";
import { routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

// 區域頁：照片＋起步點標記（可隱藏，只看岩牆）、難度／顏色／風格篩選、路線列表
export default function ZoneView({ zoneId }: { zoneId: string }) {
  const { session, ready } = useAuth();
  const router = useRouter();
  // 從館首頁點進來時，手機裡有上次的資料就直接先畫出來（不會先閃一下「讀取中」）；最新的資料由下面的 load 補上
  const [init] = useState(() => (ready ? peekCache<ZoneData>(`zone:${zoneId}:${session?.user.id ?? "guest"}`) : null));
  const [zone, setZone] = useState<Zone | null>(init?.z ?? null);
  const [gym, setGym] = useState<Gym | null>(init?.g ?? null);
  const [routes, setRoutes] = useState<Route[]>(init?.rs ?? []);
  const [ascents, setAscents] = useState<Record<string, Ascent>>(() => (init ? overlayPending(init.as, session?.user.id) : {}));
  const [counts, setCounts] = useState<Record<string, number>>(init?.cs ?? {});
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
  const tapeExample = grades.find((g) => gradeColor(g)) ?? null;
  const colors = [...new Set(routes.map((r) => r.hold_color))];
  const tags = STYLE_TAGS.filter((t) => routes.some((r) => r.style_tags.includes(t)));
  const days = daysUntil(zone.next_reset_on);
  const commentsOn = gym.comments_enabled;
  const src = photoUrl(zone.photo_path);

  return (
    <>
      {/* 一定回這間館的首頁（登入回來時上一頁是同一區） */}
      <BackLink onClick={() => upTo(router, `/gym/${zone.gym_id}`)}>{gym.name}</BackLink>
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
        <WallPhoto src={src} alt={`${zone.name}照片`} hideable={routes.length > 0}>
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
          {/* 第一次來的人看不懂：圓點顏色、膠帶顏色、Flash、分數 */}
          <HowTo
            id="zone"
            title="顏色和分數怎麼看"
            lines={[
              `照片上的圓點：顏色是岩點的顏色（下面的顏色篩選也是），數字是難度${zone.grade_system === "yds" ? "（10a 就是 5.10a）" : ""}`,
              // 有膠帶顏色的難度才說（YDS、V9／V10 還沒有顏色）
              ...(tapeExample != null ? [`難度標籤（例如 ${gradeLabel(tapeExample)}）的顏色是牆上膠帶的顏色`] : []),
              `Flash：第一次嘗試就完攀${rules ? `，分數 ×${rules.flash_multiplier}` : ""}；試過幾次才爬完記「完攀」`,
              `難度越高分數越高；有風格標籤的再加分${rules ? `（每種加的不一樣，最多 +${rules.max_style_bonus}%）` : ""}`,
            ]}
          />
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
