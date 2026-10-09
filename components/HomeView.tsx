"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { Empty, PageTitle, SectionTitle } from "@/components/ui/Card";
import FloorPlan from "@/components/ui/FloorPlan";
import { NewRouteCard, NewRouteRow, ResetList, ZoneCard, ZoneList } from "@/components/ui/Gym";
import { getGym, getMyAscents, getNewRoutes, getZoneProgress, photoUrl, thumbUrl, type Ascent, type Gym, type Route, type ZoneProgress } from "@/lib/data";
import { ago, daysUntil, md } from "@/lib/date";
import { PLANS } from "@/lib/floorplan";
import { saveLastGym, SPRAY_WALLS, sprayPath } from "@/lib/gyms";
import { overlayPending, withCache } from "@/lib/offline";

const PLACEHOLDER =
  "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'><rect width='4' height='3' fill='#D2D7D2'/></svg>");

// 館內路線首頁：平面圖、各區卡片、即將換線、最新路線
export default function HomeView({ gymId }: { gymId: string }) {
  const { session, ready } = useAuth();
  const router = useRouter();
  const [gym, setGym] = useState<Gym | null>(null);
  const [zones, setZones] = useState<ZoneProgress[] | null>(null);
  const [fresh, setFresh] = useState<(Route & { zone_name: string })[]>([]);
  const [ascents, setAscents] = useState<Record<string, Ascent>>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<(Route & { zone_name: string }) | null>(null);
  const uid = session?.user.id;

  // 第一次載入時先顯示手機裡上次的資料，抓到最新的再換掉
  const first = useRef(true);
  const load = useCallback(async () => {
    type Data = { g: Gym; z: ZoneProgress[]; n: (Route & { zone_name: string })[]; a: Record<string, Ascent> };
    const apply = (data: Data) => {
      setGym(data.g);
      setZones(data.z);
      setFresh(data.n);
      setAscents(overlayPending(data.a, uid));
    };
    try {
      const { data } = await withCache<Data>(
        `home:${gymId}:${uid ?? "guest"}`,
        async () => {
          const [g, z, n] = await Promise.all([getGym(gymId), getZoneProgress(gymId), getNewRoutes(gymId)]);
          return { g, z, n, a: uid ? await getMyAscents(n.map((r) => r.id)) : {} };
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
  const upcoming = zones
    .filter((z) => (daysUntil(z.next_reset_on) ?? -1) >= 0)
    .sort((a, b) => a.next_reset_on!.localeCompare(b.next_reset_on!))
    .slice(0, 3);
  const goZone = (id: string) => router.push(`/zone?id=${id}`);

  return (
    <>
      <PageTitle sub={session ? `牆上 ${total} 條路線，你完成了 ${done} 條` : `牆上 ${total} 條路線，登入後就能記錄完攀`}>今天爬哪一區？</PageTitle>
      {PLANS[gymId] && (
        <FloorPlan
          shape={PLANS[gymId]}
          gymName={gym?.name ?? ""}
          zones={zones.map((z) => ({ code: z.code, name: z.name, done: z.done_count, total: z.route_count, resetDays: daysUntil(z.next_reset_on) }))}
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

      <SectionTitle>所有區域</SectionTitle>
      <ZoneList>
        {zones.map((z) => (
          <ZoneCard
            key={z.zone_id}
            photo={thumbUrl(z.photo_path) ?? PLACEHOLDER}
            fallback={photoUrl(z.photo_path) ?? undefined}
            name={z.name}
            done={z.done_count}
            total={z.route_count}
            resetDays={daysUntil(z.next_reset_on)}
            onClick={() => goZone(z.zone_id)}
          />
        ))}
      </ZoneList>

      <SectionTitle>即將換線</SectionTitle>
      {upcoming.length ? (
        <ResetList
          items={upcoming.map((z) => ({
            key: z.zone_id,
            name: z.name,
            date: md(z.next_reset_on!),
            left: z.route_count - z.done_count,
            days: daysUntil(z.next_reset_on)!,
          }))}
        />
      ) : (
        <Empty>目前沒有排定換線日。</Empty>
      )}

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
