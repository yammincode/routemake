"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { Empty, PageTitle, SectionTitle, Tip } from "@/components/ui/Card";
import FloorPlan from "@/components/ui/FloorPlan";
import { BandPicker, dueText, GoalLine, GradeChart, NewRouteCard, NewRouteRow, ZoneCard, ZoneList, type ZoneReset } from "@/components/ui/Gym";
import {
  getGym,
  getGymGrades,
  getResetCalendar,
  getMyAscents,
  getNewRoutes,
  getZoneProgress,
  photoUrl,
  thumbUrl,
  type Ascent,
  type GradeRow,
  type Gym,
  type Route,
  type ZoneProgress,
} from "@/lib/data";
import { ago, daysUntil, isNew, todayYmd } from "@/lib/date";
import { GRADE_BANDS, inBand, isYds, type BandId } from "@/lib/design";
import { addDays, resetPhase, resetRange, type ResetEvent } from "@/lib/resets";
import { PLANS } from "@/lib/floorplan";
import { saveLastGym, SPRAY_WALLS, sprayPath } from "@/lib/gyms";
import { overlayPending, withCache } from "@/lib/offline";

const PLACEHOLDER =
  "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'><rect width='4' height='3' fill='#D2D7D2'/></svg>");

// 難度篩選記在這支手機（隱私模式等讀寫失敗就當沒選）
const BAND_KEY = "routemake:home-band";
function savedBand(): BandId | null {
  try {
    const v = localStorage.getItem(BAND_KEY);
    return GRADE_BANDS.some((b) => b.id === v) ? (v as BandId) : null;
  } catch {
    return null;
  }
}

// 館內路線首頁：平面圖、快換線提醒、全館難度分布與難度篩選、各區難度色帶卡片（含換線日）、最新路線
// 換線日：有換線公告就照公告（10/19–20 換線、換線中），沒有公告就用員工設的下次換線日
export default function HomeView({ gymId }: { gymId: string }) {
  const { session, ready } = useAuth();
  const router = useRouter();
  const [gym, setGym] = useState<Gym | null>(null);
  const [zones, setZones] = useState<ZoneProgress[] | null>(null);
  const [fresh, setFresh] = useState<(Route & { zone_name: string })[]>([]);
  const [ascents, setAscents] = useState<Record<string, Ascent>>({});
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [resets, setResets] = useState<ResetEvent[]>([]);
  const [bandId, setBandId] = useState<BandId | null>(savedBand);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<(Route & { zone_name: string }) | null>(null);
  const uid = session?.user.id;

  // 第一次載入時先顯示手機裡上次的資料，抓到最新的再換掉
  const first = useRef(true);
  const load = useCallback(async () => {
    type Data = { g: Gym; z: ZoneProgress[]; n: (Route & { zone_name: string })[]; a: Record<string, Ascent>; r?: GradeRow[]; ev?: ResetEvent[] };
    const apply = (data: Data) => {
      setGym(data.g);
      setZones(data.z);
      setFresh(data.n);
      setAscents(overlayPending(data.a, uid));
      setGrades(data.r ?? []); // 舊版存在手機裡的資料沒有 r
      setResets(data.ev ?? []);
    };
    try {
      const { data } = await withCache<Data>(
        `home:${gymId}:${uid ?? "guest"}`,
        async () => {
          const today = todayYmd();
          const [g, z, n, r, ev] = await Promise.all([
            getGym(gymId),
            getZoneProgress(gymId),
            getNewRoutes(gymId),
            getGymGrades(gymId),
            getResetCalendar(today, addDays(today, 60)).catch(() => [] as ResetEvent[]),
          ]);
          return { g, z, n, r, ev: ev.filter((e) => e.gym_id === gymId), a: uid ? await getMyAscents(n.map((x) => x.id)) : {} };
        },
        first.current ? apply : undefined
      );
      first.current = false;
      apply(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [gymId, uid]);

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

  // 先把區域頁的程式和畫面抓好，點區域時不用等
  useEffect(() => {
    router.prefetch("/zone");
  }, [router]);

  // 各區牆上的難度（由易到難）、3 天內有沒有新路線；全館抱石難度
  const byZone = useMemo(() => {
    const m = new Map<string, { grades: number[]; fresh: boolean }>();
    for (const r of grades) {
      const z = m.get(r.zone_id) ?? { grades: [], fresh: false };
      z.grades.push(r.grade);
      if (isNew(r.created_at, 3)) z.fresh = true;
      m.set(r.zone_id, z);
    }
    for (const z of m.values()) z.grades.sort((a, b) => a - b);
    return m;
  }, [grades]);
  const boulder = useMemo(() => grades.map((r) => r.grade).filter((g) => !isYds(g)), [grades]);
  // 上攀（YDS）為主的館沒有膠帶顏色，不顯示難度分布和篩選
  const showBands = boulder.length > 0 && boulder.length * 2 >= grades.length;
  const band = showBands ? (GRADE_BANDS.find((b) => b.id === bandId) ?? null) : null;
  const pickBand = (b: BandId | null) => {
    setBandId(b);
    try {
      if (b) localStorage.setItem(BAND_KEY, b);
      else localStorage.removeItem(BAND_KEY);
    } catch {}
  };

  if (error && !zones)
    return (
      <>
        <PageTitle>今天爬哪一區？</PageTitle>
        <Empty>{error}</Empty>
        <div className="mt-3">
          <Button onClick={load}>重新整理</Button>
        </div>
      </>
    );
  if (!zones) return <PageTitle sub="讀取中…">今天爬哪一區？</PageTitle>;

  const total = zones.reduce((s, z) => s + z.route_count, 0);
  const done = zones.reduce((s, z) => s + z.done_count, 0);
  // 每一區的換線：公告裡還沒結束、最早的那筆；沒有公告就用員工設的下次換線日
  const today = todayYmd();
  const resetOf = (z: ZoneProgress): ZoneReset | null => {
    const e = resets.filter((x) => x.zone_ids.includes(z.zone_id) && x.ends_on >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
    if (e) {
      const p = resetPhase(e, today);
      if (p.phase === "ongoing") return { days: 0, ongoing: true, text: `換線中・${e.ends_on === today ? "今晚" : `${+e.ends_on.slice(5, 7)}/${+e.ends_on.slice(8, 10)} 晚上`}起新路線`, warn: true };
      return { days: p.days, ongoing: false, text: `${resetRange(e)} 換線・${p.days === 0 ? "今天" : `${p.days} 天後`}`, warn: p.days <= 7 };
    }
    const d = daysUntil(z.next_reset_on);
    return d == null || d < 0 ? null : { days: d, ongoing: false, text: dueText(d), warn: d <= 7 };
  };
  const zoneResets = new Map(zones.map((z) => [z.zone_id, resetOf(z)]));
  const goZone = (id: string) => router.push(`/zone?id=${id}`);
  // 提醒：最快換線（7 天內、還沒開始換）、而且還有沒完攀路線的區；正在換的牆不提醒
  const guest = !session;
  const goal = zones
    .filter((z) => {
      const r = zoneResets.get(z.zone_id);
      return r != null && !r.ongoing && r.days >= 0 && r.days <= 7 && z.route_count > 0 && (guest || z.done_count < z.route_count);
    })
    .sort((a, b) => zoneResets.get(a.zone_id)!.days - zoneResets.get(b.zone_id)!.days)[0];
  const goalReset = goal ? zoneResets.get(goal.zone_id)! : null;
  const scale = Math.max(1, ...zones.map((z) => byZone.get(z.zone_id)?.grades.length ?? 0));
  const hitZones = band ? zones.filter((z) => byZone.get(z.zone_id)?.grades.some((g) => inBand(g, band))).length : 0;

  return (
    <>
      <PageTitle sub={session ? `牆上 ${total} 條路線，你完成了 ${done} 條` : `牆上 ${total} 條路線，登入後就能記錄完攀`}>今天爬哪一區？</PageTitle>
      {PLANS[gymId] && (
        <FloorPlan
          shape={PLANS[gymId]}
          gymName={gym?.name ?? ""}
          guest={guest}
          zones={zones.map((z) => ({ code: z.code, name: z.name, done: z.done_count, total: z.route_count, resetDays: zoneResets.get(z.zone_id)?.days ?? null }))}
          onSelect={(code) => {
            const z = zones.find((x) => x.code === code);
            if (z) goZone(z.zone_id);
          }}
        />
      )}

      {SPRAY_WALLS.filter((s) => s.gymId === gymId).map((s) => (
        <Button
          key={s.id}
          className="mt-2"
          onClick={() => {
            saveLastGym(s.id);
            router.push(sprayPath(s.id));
          }}
        >
          {s.name} →
        </Button>
      ))}

      {goal && goalReset && (
        <GoalLine label={guest ? "快換線" : "下一個目標"} onClick={() => goZone(goal.zone_id)}>
          {goal.name} {dueText(goalReset.days)}，{guest ? `共 ${goal.route_count} 條路線` : `還有 ${goal.route_count - goal.done_count} 條沒完攀`}
        </GoalLine>
      )}

      <SectionTitle>所有區域</SectionTitle>
      {showBands && (
        <>
          <GradeChart grades={boulder} band={band} onBand={pickBand} />
          <div className="mt-3 mb-2">
            <BandPicker value={band?.id ?? null} onChange={pickBand} />
          </div>
          <Tip>
            {!band
              ? "色帶是牆上的膠帶顏色，數字是這個難度有幾條。"
              : hitZones
                ? `有 ${hitZones} 個區域有 ${band.range} 的路線，其他區域變淡。`
                : `目前沒有 ${band.range} 的路線。`}
          </Tip>
        </>
      )}
      <ZoneList>
        {zones.map((z) => {
          const info = byZone.get(z.zone_id);
          return (
            <ZoneCard
              key={z.zone_id}
              photo={thumbUrl(z.photo_path) ?? PLACEHOLDER}
              fallback={photoUrl(z.photo_path) ?? undefined}
              name={z.name}
              done={z.done_count}
              total={z.route_count}
              grades={info?.grades ?? []}
              scale={scale}
              band={band}
              guest={guest}
              fresh={info?.fresh ?? false}
              due={zoneResets.get(z.zone_id) ?? null}
              onClick={() => goZone(z.zone_id)}
            />
          );
        })}
      </ZoneList>

      <SectionTitle>最新路線</SectionTitle>
      {fresh.length ? (
        <NewRouteRow>
          {fresh.map((r) => (
            <NewRouteCard key={r.id} color={r.hold_color} grade={r.grade} zone={r.zone_name} ago={ago(r.created_at)} onClick={() => setOpen(r)} />
          ))}
        </NewRouteRow>
      ) : (
        <Empty>這週還沒有新路線。</Empty>
      )}

      <RouteSheet
        route={open}
        zoneName={open?.zone_name ?? ""}
        gymId={gymId}
        gymCommentsOn={gym?.comments_enabled ?? true}
        ascent={open ? (ascents[open.id] ?? null) : null}
        onClose={() => setOpen(null)}
        onSaved={() => void load()}
      />
    </>
  );
}
