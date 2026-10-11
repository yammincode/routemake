"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  takeZoneAhead,
  seqTotal,
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

// 區域頁換區時先知道的東西（館、區域名字）：路線還在讀的時候標題、返回、上一區／下一區照樣顯示
export type ZoneHead = { gymId: string; gymName: string; zoneName: string };

// 區域頁：照片＋起步點標記（可隱藏，只看岩牆）、難度／顏色／風格篩選、路線列表
// 難度篩選由外面記（左右滑換區時保留：新的區有這個難度就照樣篩，沒有就顯示全部）；nav：標題下面的上一區／下一區
// onZone：讀到這一區的資料時告訴外面（換區用的館、名字、路線數）
export default function ZoneView({
  zoneId,
  grade: wantGrade,
  onGrade,
  head,
  nav,
  onZone,
}: {
  zoneId: string;
  grade: number | null;
  onGrade: (g: number | null) => void;
  head?: ZoneHead | null;
  nav?: ReactNode;
  onZone?: (z: ZoneHead & { total: number }) => void;
}) {
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
      // 滑向這一區時已經先讀了：直接用那一份（只有第一次）
      const { data } = await withCache(`zone:${zoneId}:${uid ?? "guest"}`, () => takeZoneAhead(zoneId) ?? getZoneView(zoneId), first.current ? apply : undefined);
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

  // 讀到資料就告訴外面（換區用）
  const total = routes.length;
  useEffect(() => {
    if (zone && gym) onZone?.({ gymId: zone.gym_id, gymName: gym.name, zoneName: zone.name, total });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在這一區的資料變了才說
  }, [zone?.id, zone?.gym_id, zone?.name, gym?.name, total]);

  // 還沒讀到這一區（或讀不到）：知道館和名字（換區過來的）就照樣顯示標題、返回、上一區／下一區
  if (!zone || !gym) {
    const retry = (
      <>
        <Empty>{error}</Empty>
        <div className="mt-3">
          <Button onClick={load}>重新整理</Button>
        </div>
      </>
    );
    if (!head)
      return error ? (
        <>
          <BackLink onClick={() => backOr(router, "/gyms")}>返回</BackLink>
          {retry}
        </>
      ) : (
        <Empty>讀取中…</Empty>
      );
    return (
      <>
        <BackLink onClick={() => upTo(router, `/gym/${head.gymId}`)}>{head.gymName}</BackLink>
        <h1 className="mt-1 mb-1.5 text-title font-black">{head.zoneName}</h1>
        <p className="mt-0 mb-[18px] text-sub text-muted">&nbsp;</p>
        {nav}
        {error ? retry : <Empty>讀取中…</Empty>}
      </>
    );
  }

  const status = (r: Route) => ascents[r.id]?.status ?? null;
  const done = routes.filter((r) => status(r) === "flash" || status(r) === "send").length;
  const grades = [...new Set(routes.map((r) => r.grade))].sort((a, b) => a - b);
  // 記著的難度這一區有才篩，沒有就顯示全部（記著的不變，換到有的區又會篩）
  const grade = wantGrade != null && grades.includes(wantGrade) ? wantGrade : null;
  const match = (r: Route) =>
    (grade == null || r.grade === grade) && (color == null || r.hold_color === color) && (tag == null || r.style_tags.includes(tag));
  const tapeExample = grades.find((g) => gradeColor(g)) ?? null;
  const colors = [...new Set(routes.map((r) => r.hold_color))];
  const tags = STYLE_TAGS.filter((t) => routes.some((r) => r.style_tags.includes(t)));
  const days = daysUntil(zone.next_reset_on);
  const commentsOn = gym.comments_enabled;
  const src = photoUrl(zone.photo_path);
  // 長耐力：路線不分顏色，照順序標 1–50 點；顧客記錄最高爬到第幾點
  const endurance = zone.grade_system === "endurance";
  const progress = (r: Route) => {
    const n = seqTotal(r);
    const hp = ascents[r.id]?.status === "project" ? ascents[r.id]?.highpoint : null;
    return n ? `${n} 點${hp ? `・你爬到 ${hp}／${n}` : ""}` : null;
  };

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
      {nav}

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
                label={seqTotal(r) ? `${gradeLabel(r.grade)} ${seqTotal(r)} 點 ${r.code}` : `${gradeLabel(r.grade)} ${r.hold_color}色 ${r.code}`}
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
              ...(endurance
                ? [
                    "長耐力：照片上的圓點是每條路線的起攀點，數字是難度（10a 就是 5.10a）；點進路線看全部的點，綠圈第 1 點、紅圈最後一點",
                    `沒爬完記「嘗試中」和最高爬到第幾點，照比例算分（爬到一半拿一半分數）`,
                  ]
                : [`照片上的圓點：顏色是岩點的顏色（下面的顏色篩選也是），數字是難度${zone.grade_system === "yds" ? "（10a 就是 5.10a）" : ""}`]),
              // 有膠帶顏色的難度才說（YDS、V9／V10 還沒有顏色）
              ...(tapeExample != null ? [`難度標籤（例如 ${gradeLabel(tapeExample)}）的顏色是牆上膠帶的顏色`] : []),
              `Flash：第一次嘗試就完攀${rules ? `，分數 ×${rules.flash_multiplier}` : ""}；試過幾次才爬完記「完攀」`,
              `難度越高分數越高；有風格標籤的再加分${rules ? `（每種加的不一樣，最多 +${rules.max_style_bonus}%）` : ""}`,
            ]}
          />
          <ChipRow>
            <Chip num pressed={grade == null} onClick={() => onGrade(null)}>
              全部
            </Chip>
            {grades.map((g) => (
              <GradeChip key={g} grade={g} pressed={grade === g} onClick={() => onGrade(g)} />
            ))}
          </ChipRow>
          {!endurance && (
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
          )}
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
              color={seqTotal(r) ? undefined : r.hold_color}
              grade={r.grade}
              title={
                <>
                  {seqTotal(r) ? r.code : `${r.hold_color}色 ${r.code}`}
                  {rules && <Points n={routePoints(r.grade, r.style_tags, rules)} />}
                </>
              }
              isNew={isNew(r.created_at)}
              status={status(r)}
              meta={
                <>
                  {progress(r) && <span className="mr-1.5">{progress(r)}</span>}
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
        photo={src}
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
