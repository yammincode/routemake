"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PageCheer } from "@/components/MascotCheer";
import PointsPanel from "@/components/PointsPanel";
import RouteSheet from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { GymLegend, ProgressCard } from "@/components/ui/Progress";
import { Points, RouteList, RouteRow } from "@/components/ui/Route";
import { CalendarHeat, DaySummary, Delta, MonthGradeChart, MonthSwitcher, StatGrid, StatTile, TotalRow, type DayGym, type MonthCol } from "@/components/ui/Stats";
import { Tabs } from "@/components/ui/Tabs";
import { ShareButton, SharePreview } from "@/components/ui/Share";
import { useToast } from "@/components/ui/Toast";
import {
  getGyms,
  getLiveWallRoutes,
  getMonthAscents,
  getMonthlyStats,
  getMySends,
  getPointsSummary,
  getSlamInfo,
  seqPhotoUrl,
  heroPhoto,
  seqTotal,
  type Gym,
  type MonthAscent,
  type MonthStats,
  type MySend,
  type PointsSummary,
  type SlamInfo,
  type WallRoute,
} from "@/lib/data";
import { meLines } from "@/lib/cheer";
import { todayYmd } from "@/lib/date";
import { FEEL, GRADE_FEEL, GRADES, gradeLabel } from "@/lib/design";
import { GYMS } from "@/lib/gyms";
import { useMascot } from "@/lib/mascot-store";
import { canShareIg } from "@/lib/share";
import { drawMonthCard } from "@/lib/share-cards";
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
  // 攀爬日點了哪一天、有沒有按「看路線 ›」；換月份就收起來
  const [day, setDay] = useState<{ d: number; open: boolean } | null>(null);
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
  // 分享到 IG（C1 本月完攀圖）：按了先打開預覽、在手機上畫圖
  const [card, setCard] = useState<{ file: File | null; url: string | null } | null>(null);
  const cardRun = useRef(0); // 第幾次按：關掉又打開時，前一次慢做好的圖不要塞進來
  // 上面的數字是哪個月的（剛換月份、還沒讀到新的那個月時不能分享，免得用到上個月的數字）
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  useEffect(() => () => void (card?.url && URL.revokeObjectURL(card.url)), [card]);
  const mascot = useMascot(canShareIg(access) ? uid : null); // 分享圖用；顧客不用多讀一次
  const toast = useToast();

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
      setLoadedMonth(`${ym.y}-${ym.m}`);
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
  const prev = () => (setPick(null), setDay(null), setYm(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 })));
  const next = () => (setPick(null), setDay(null), setYm(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 })));

  const counts = stats ? Object.fromEntries(Object.entries(stats.by_day).map(([d, n]) => [+d, n])) : {};

  const slam = (r: ProgressRow) => slamAction(slamInfo, !!access?.is_owner, r);
  const openSlam = (grade: number) => router.push(slamPath(grade));
  // 原岩夥伴：講這個月的成績、差一兩條的大滿貫（這頁本來就算好的，不多讀資料）
  const wall = progress ? wallProgress(progress.routes, (id) => progress.done.has(id)) : null;
  const near = wall ? [...wall.boulder, ...wall.rope].filter((r) => r.total >= 2 && r.total - r.done > 0 && r.total - r.done <= 2).map((r) => ({ grade: gradeLabel(r.grade), left: r.total - r.done })) : [];
  // 路線進度讀好（或讀不到）才說，差一兩條的大滿貫才講得到；換到別的月份不說
  const mePool = isNow && stats && (progress || progressError) ? meLines({ sends: stats.sends, prev: stats.prev_sends, flashes: stats.flashes, days: stats.days, near }) : null;
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
  const ascentRow = (a: MonthAscent) => {
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
            {a.route.name ? `${a.route.zone_name}・${a.route.name}` : n ? `${a.route.zone_name} ${a.route.code}` : `${a.route.zone_name} ${a.route.hold_color}色`} {feelEmoji(a.feel)}
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
  };

  // 攀爬日：每天爬過哪幾館（照館的固定順序：明德、萬華…）；點一天列出那天依館分開的完攀數、難度，路線也依館排在一起
  // 完攀數跟月曆深淺一樣只算岩館路線的完攀，岩友路線、長耐力沒爬完的另外寫、路線照樣列出來（跟本月完攀直條圖一樣）
  const dayOf = (a: MonthAscent) => +a.climbed_on.slice(8, 10);
  const gymOrder = (id: string) => GYMS.findIndex((g) => g.id === id) >>> 0;
  const dayGyms: Record<number, string[]> = {};
  for (const a of list) {
    const gs = (dayGyms[dayOf(a)] ??= []);
    if (!gs.includes(a.route.gym_id)) gs.push(a.route.gym_id);
  }
  for (const gs of Object.values(dayGyms)) gs.sort((x, y) => gymOrder(x) - gymOrder(y));
  const pickedDay = day && dayGyms[day.d] ? day : null;
  const dayList = pickedDay ? list.filter((a) => dayOf(a) === pickedDay.d).sort((x, y) => gymOrder(x.route.gym_id) - gymOrder(y.route.gym_id)) : [];
  const counted = (a: MonthAscent) => a.status !== "project" && a.route.kind !== "community";
  const daySent = dayList.filter(counted);
  const dayGymRows: DayGym[] = pickedDay
    ? dayGyms[pickedDay.d].map((gym) => {
        const mine = dayList.filter((a) => a.route.gym_id === gym);
        const sent = mine.filter(counted);
        const grades = chartCols.filter((c) => sent.some((a) => colKey(a.route.grade) === c.key)).map((c) => ({ label: c.label, n: sent.filter((a) => colKey(a.route.grade) === c.key).length }));
        const community = mine.filter((a) => a.status !== "project" && a.route.kind === "community").length;
        const projects = mine.filter((a) => a.status === "project").length;
        const more = [community && `岩友路線 ${community} 條`, projects && `長耐力沒爬完 ${projects} 條`].filter(Boolean).join("，");
        return { gym, sends: sent.length, grades, more };
      })
    : [];

  // C1 本月完攀圖：正在看的那個月（上個月也可以分享）；數字跟上面四格、本月完攀直條圖一樣
  const openCard = async () => {
    if (!stats?.sends || loadedMonth !== `${ym.y}-${ym.m}`) return;
    const run = ++cardRun.current;
    setCard({ file: null, url: null });
    try {
      const gyms = [...new Set(list.filter(counted).map((a) => a.route.gym_id))].sort((x, y) => gymOrder(x) - gymOrder(y));
      const blob = await drawMonthCard({
        year: ym.y,
        month: ym.m,
        sends: stats.sends,
        flashes: stats.flashes,
        days: stats.days,
        points: points?.month_total ?? null,
        top: stats.top_grade != null ? gradeLabel(stats.top_grade) : stats.top_yds != null ? gradeLabel(stats.top_yds) : null,
        gyms,
        boulder: boulderCols.map((c) => ({ label: c.label, grade: c.grade, n: c.sends })),
        rope: ropeCols.map((c) => ({ label: c.label, n: c.sends })),
        mascot: mascot ?? { id: "mingde" },
        nickname: access?.nickname ?? "",
      });
      if (run !== cardRun.current) return;
      const file = new File([blob], `routemake-${ym.y}-${String(ym.m).padStart(2, "0")}.jpg`, { type: "image/jpeg" });
      setCard({ file, url: URL.createObjectURL(file) });
    } catch {
      if (run !== cardRun.current) return;
      setCard(null);
      toast("圖片做不出來，請再試一次");
    }
  };

  return (
    <>
      {uid && <PageCheer uid={uid} page="me" pool={mePool} />}
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
      {canShareIg(access) && stats && (
        <ShareButton className="mt-2" disabled={!stats.sends || loadedMonth !== `${ym.y}-${ym.m}`} onClick={() => void openCard()}>
          {stats.sends ? `分享 ${ym.m} 月成績到 IG` : `${ym.m} 月還沒有完攀，不能分享`}
        </ShareButton>
      )}

      <PointsPanel year={ym.y} month={ym.m} isNow={isNow} todayDay={now.d} summary={points} />

      <SectionTitle>攀爬日</SectionTitle>
      <CalendarHeat
        year={ym.y}
        month={ym.m}
        counts={counts}
        today={isNow ? now.d : undefined}
        gyms={dayGyms}
        picked={pickedDay?.d ?? null}
        onPick={(d) => setDay(d ? { d, open: false } : null)}
      />
      {pickedDay ? (
        <DaySummary
          title={`${ym.m}/${pickedDay.d}（${"日一二三四五六"[new Date(ym.y, ym.m - 1, pickedDay.d).getDay()]}）`}
          sends={daySent.length}
          flashes={daySent.filter((a) => a.status === "flash").length}
          points={points?.by_day[String(pickedDay.d)]}
          gyms={dayGymRows}
          open={pickedDay.open}
          onOpen={() => setDay({ d: pickedDay.d, open: true })}
          onClose={() => setDay(null)}
        >
          <RouteList>{dayList.map(ascentRow)}</RouteList>
        </DaySummary>
      ) : (
        Object.keys(dayGyms).length > 0 && (
          <>
            <GymLegend gyms={[...new Set(Object.values(dayGyms).flat())].sort((x, y) => gymOrder(x) - gymOrder(y))} />
            <Tip>點有顏色的日期，看那天在哪一館、爬了哪些路線。圓點是館的顏色。</Tip>
          </>
        )
      )}

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
                {shown.map(ascentRow)}
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
        zonePhoto={open ? heroPhoto(open.route, open.route.zone_photo ?? null) : null}
        zoneName={open?.route.zone_name ?? ""}
        gymId={open?.route.gym_id ?? gymId}
        gymCommentsOn={gymComments?.[open?.route.gym_id ?? gymId] ?? false}
        ascent={open}
        onClose={() => setOpen(null)}
        onSaved={() => void (loadMonth(), loadProgress())}
      />
      <SharePreview open={!!card} onClose={() => (cardRun.current++, setCard(null))} title={`分享 ${ym.m} 月成績到 IG`} what="圖片" file={card?.file ?? null} image={card?.url ?? null} note="圖上有完攀條數、積分、Flash、攀爬天數、各難度條數、去過的館、你的暱稱和原岩夥伴，不會有路線心得。" />
    </>
  );
}
