"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import PointsPanel from "@/components/PointsPanel";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { GymLegend, ProgressCard } from "@/components/ui/Progress";
import { Points, RouteList, RouteRow } from "@/components/ui/Route";
import { CalendarHeat, Delta, MonthGradeChart, MonthSwitcher, StatGrid, StatTile, TotalRow, type MonthCol } from "@/components/ui/Stats";
import { Tabs } from "@/components/ui/Tabs";
import {
  getGyms,
  getLiveWallRoutes,
  getMonthAscents,
  getMonthlyStats,
  getMySends,
  getPointsSummary,
  getSlamInfo,
  seqPhotoUrl,
  seqTotal,
  type Gym,
  type MonthAscent,
  type MonthStats,
  type MySend,
  type PointsSummary,
  type SlamInfo,
  type WallRoute,
} from "@/lib/data";
import { todayYmd } from "@/lib/date";
import { FEEL, GRADE_FEEL, GRADES, gradeLabel } from "@/lib/design";
import { overlayPending, withCache } from "@/lib/offline";
import { myProgress, progressGyms, wallProgress, type ProgressRow } from "@/lib/progress";
import { ascentPoints } from "@/lib/scoring";
import { slamAction, slamPath } from "@/lib/slam";
import { useScoring } from "@/lib/useScoring";

// 路線進度的兩個分頁；選哪一個記在手機
type ProgressTab = "wall" | "mine";
const PROGRESS_TABS = [
  { key: "wall", label: "牆上進度" },
  { key: "mine", label: "我的進度" },
] as const;
const TAB_KEY = "routemake-progress-tab";
const savedTab = (): ProgressTab => {
  try {
    return localStorage.getItem(TAB_KEY) === "mine" ? "mine" : "wall";
  } catch {
    return "wall";
  }
};

const thisMonth = () => {
  const t = todayYmd();
  return { y: +t.slice(0, 4), m: +t.slice(5, 7), d: +t.slice(8, 10) };
};

// 我的紀錄：月份切換、四格統計、攀爬日月曆、本月完攀直條圖（點一根才列出那個難度的路線和心得）、累計、路線進度（牆上進度／我的進度）
export default function MeView({ gymId }: { gymId: string }) {
  const { session, ready, access } = useAuth();
  const router = useRouter();
  const now = thisMonth();
  const [ym, setYm] = useState({ y: now.y, m: now.m });
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const rules = useScoring();
  const [list, setList] = useState<MonthAscent[]>([]);
  // 本月完攀直條圖點了哪一根（v:3＝V3、y:104＝5.10）；換月份就收起來
  const [pick, setPick] = useState<string | null>(null);
  // 路線進度：開放的館現在牆上的路線、自己完攀過的岩館路線（done＝牆上進度算完成的路線，含還沒送出的紀錄）
  const [progress, setProgress] = useState<{ routes: WallRoute[]; sends: MySend[]; done: Set<string> } | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  // 大滿貫兌換（step40）：活動設定和自己的兌換碼；讀不到（沒網路、資料庫還沒套用）就不顯示兌換
  const [slamInfo, setSlamInfo] = useState<SlamInfo | null>(null);
  const [tab, setTab] = useState<ProgressTab>("wall");
  // 路線卡片：各館有沒有開放留言（打開哪一館的路線就查哪一館；存在手機，離線也查得到）
  const [gymComments, setGymComments] = useState<Record<string, boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MonthAscent | null>(null);
  const uid = session?.user.id;

  // 第一次載入時先顯示手機裡上次的資料，抓到最新的再換掉
  const firstMonth = useRef(true);
  const firstProgress = useRef(true);
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

  const loadProgress = useCallback(async () => {
    if (!uid) return;
    type Data = { routes: WallRoute[]; sends: MySend[] };
    const apply = (data: Data) => {
      // 牆上進度也算手機裡還沒送出的紀錄（離線時記的）；我的進度跟上面的累計完攀一樣只算已經送出的
      const mine = overlayPending(Object.fromEntries(data.sends.map((s) => [s.route_id, { route_id: s.route_id, status: "send" }])), uid);
      const done = new Set(Object.values(mine).filter((a) => a.status === "flash" || a.status === "send").map((a) => a.route_id));
      setProgress({ ...data, done });
    };
    try {
      const { data } = await withCache<Data>(
        `progress:${uid}`,
        async () => {
          const [routes, sends] = await Promise.all([getLiveWallRoutes(), getMySends(uid)]);
          return { routes, sends };
        },
        firstProgress.current ? apply : undefined
      );
      firstProgress.current = false;
      apply(data);
      setProgressError(null);
    } catch (e) {
      // 只影響路線進度這一段：在這一段顯示錯誤和「重新整理」（上面的月統計照常）
      setProgressError((e as Error).message);
    }
  }, [uid]);
  const loadGyms = useCallback(async () => {
    const apply = (gs: Gym[]) => setGymComments(Object.fromEntries(gs.map((g) => [g.id, g.comments_enabled])));
    try {
      apply((await withCache<Gym[]>("gyms", getGyms, apply)).data);
    } catch {}
  }, []);

  useEffect(() => {
    if (!ready) return;
    void Promise.resolve().then(loadMonth);
    window.addEventListener("routemake:synced", loadMonth);
    return () => window.removeEventListener("routemake:synced", loadMonth);
  }, [ready, loadMonth]);
  useEffect(() => {
    // 換人登入、登出：先清掉上一個人的兌換狀態
    queueMicrotask(() => setSlamInfo(null));
    if (!ready || !uid) return;
    let alive = true;
    const load = () =>
      void getSlamInfo()
        .then((i) => alive && setSlamInfo(i))
        .catch(() => undefined);
    load();
    // 跟路線進度一樣：網路恢復、紀錄送出後重讀
    window.addEventListener("routemake:synced", load);
    window.addEventListener("online", load);
    return () => {
      alive = false;
      window.removeEventListener("routemake:synced", load);
      window.removeEventListener("online", load);
    };
  }, [ready, uid]);
  useEffect(() => {
    if (!ready) return;
    void Promise.resolve().then(loadProgress);
    // 紀錄送出後、網路恢復時重讀（離線第一次打開讀不到時，有訊號就自己補上）
    window.addEventListener("routemake:synced", loadProgress);
    window.addEventListener("online", loadProgress);
    return () => {
      window.removeEventListener("routemake:synced", loadProgress);
      window.removeEventListener("online", loadProgress);
    };
  }, [ready, loadProgress]);
  useEffect(() => {
    if (ready) void Promise.resolve().then(loadGyms);
  }, [ready, loadGyms]);
  useEffect(() => {
    void Promise.resolve().then(() => setTab(savedTab()));
  }, []);
  const pickTab = (t: ProgressTab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  };

  if (!ready || !session) return null;
  if (error && !stats)
    return (
      <>
        <Empty>{error}</Empty>
        <div className="mt-3">
          <Button onClick={() => void (loadMonth(), loadProgress())}>重新整理</Button>
        </div>
      </>
    );

  const isNow = ym.y === now.y && ym.m === now.m;
  const prev = () => (setPick(null), setYm(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 })));
  const next = () => (setPick(null), setYm(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 })));

  const counts = stats ? Object.fromEntries(Object.entries(stats.by_day).map(([d, n]) => [+d, n])) : {};

  const slam = (r: ProgressRow) => slamAction(slamInfo, !!access?.is_owner, r);
  const openSlam = (grade: number) => router.push(slamPath(grade));
  const prog = progress && (tab === "wall" ? wallProgress(progress.routes, (id) => progress.done.has(id)) : myProgress(progress.sends));

  // 本月完攀直條圖：抱石 VB–V10 每級一根；上攀 5.6–5.9 每級一根、5.10 以上 a–d 合成一根（20 根手機放不下）
  // 長條只算岩館路線的完攀（跟上面的完攀數一樣；岩友路線不算統計）；長耐力沒爬完、岩友路線點了照樣列出來
  const colKey = (g: number) => (g < 100 ? `v:${g}` : `y:${g < 104 ? g : 104 + Math.floor((g - 104) / 4) * 4}`);
  const col = (key: string, label: string, grade: number): MonthCol => {
    const mine = list.filter((a) => colKey(a.route.grade) === key);
    const sent = mine.filter((a) => a.status !== "project" && a.route.kind !== "community");
    const projects = mine.filter((a) => a.status === "project").length;
    const community = mine.filter((a) => a.status !== "project" && a.route.kind === "community").length;
    const more = [projects && `嘗試中 ${projects} 條`, community && `岩友路線 ${community} 條`].filter(Boolean).join("，");
    return { key, label, grade, sends: sent.length, flashes: sent.filter((a) => a.status === "flash").length, items: mine.length, more };
  };
  const boulderCols = GRADES.map((g) => col(`v:${g}`, gradeLabel(g), g));
  const ropeCols = [100, 101, 102, 103, 104, 108, 112, 116].map((g) => col(`y:${g}`, g < 104 ? gradeLabel(g) : gradeLabel(g).slice(0, -1), g));
  const chartCols = [...boulderCols, ...ropeCols];
  const picked = pick && chartCols.some((c) => c.key === pick && c.items) ? pick : null;
  const choose = setPick;
  const shown = picked ? list.filter((a) => colKey(a.route.grade) === picked) : [];
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

      <SectionTitle>本月完攀</SectionTitle>
      {chartCols.some((c) => c.items) ? (
        <>
          {boulderCols.some((c) => c.items) && <MonthGradeChart title="抱石" cols={boulderCols} picked={picked} onPick={choose} />}
          {ropeCols.some((c) => c.items) && <MonthGradeChart title="上攀" cols={ropeCols} picked={picked} onPick={choose} tone="accent" />}
          {picked ? (
            <>
              <p className="mt-3 mb-2 text-note text-muted">
                <b className="text-ink">{chartCols.find((c) => c.key === picked)?.label}</b>・{shown.length} 條，點路線看心得、改紀錄
              </p>
              <RouteList>
                {shown.map((a) => {
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
          ) : (
            <Tip>點一根長條，看這個難度這個月爬了哪些路線和心得。黃色那段是 Flash。</Tip>
          )}
        </>
      ) : (
        <Empty>這個月還沒有完攀紀錄。</Empty>
      )}

      <TotalRow label="累計完攀" value={stats?.total_sends ?? "–"} />

      {/* 路線進度（版型固定，見 CLAUDE.md）：牆上進度／我的進度 → 各館圖例 → 說明 → 抱石、上攀卡片 */}
      <SectionTitle>路線進度</SectionTitle>
      <Tabs tabs={PROGRESS_TABS} value={tab} onChange={pickTab} />
      {!prog ? (
        progressError ? (
          <>
            <Empty>{progressError}</Empty>
            <div className="mt-3">
              <Button onClick={() => void loadProgress()}>重新整理</Button>
            </div>
          </>
        ) : (
          <Empty>讀取中…</Empty>
        )
      ) : prog.boulder.length || prog.rope.length ? (
        <>
          <GymLegend gyms={progressGyms(prog)} />
          <Tip>
            {tab === "wall"
              ? "現在牆上的路線，開放的館全部一起算（Spray Wall 不算）；一個難度全部完成就是 ★ 大滿貫。點一行看各館。"
              : "你到現在完攀過的路線，換線拆掉的也算（跟上面的累計完攀一樣）；顏色是在哪一館爬的。點一行看各館。"}
          </Tip>
          {prog.boulder.length > 0 && <ProgressCard key={`${tab}-b`} title="抱石" rows={prog.boulder} mode={tab} slam={slam} onSlam={openSlam} />}
          {prog.rope.length > 0 && <ProgressCard key={`${tab}-r`} title="上攀" rows={prog.rope} mode={tab} slam={slam} onSlam={openSlam} />}
        </>
      ) : (
        <Empty>{tab === "wall" ? "牆上目前沒有路線。" : "還沒有完攀紀錄：路線按「完攀」或「Flash」就會算進來。"}</Empty>
      )}

      <RouteSheet
        route={open?.route ?? null}
        photo={open && seqTotal(open.route) ? seqPhotoUrl(open.route, open.route.zone_photo ?? null) : null}
        zoneName={open?.route.zone_name ?? ""}
        gymId={open?.route.gym_id ?? gymId}
        gymCommentsOn={gymComments?.[open?.route.gym_id ?? gymId] ?? false}
        ascent={open}
        onClose={() => setOpen(null)}
        onSaved={() => void (loadMonth(), loadProgress())}
      />
    </>
  );
}
