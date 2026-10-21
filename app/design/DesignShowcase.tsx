"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Header from "@/components/Header";
import { Button, LinkButton } from "@/components/ui/Button";
import { BackLink, Empty, PageTitle, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow, GradeChip } from "@/components/ui/Chip";
import { ClimbDay } from "@/components/ui/ClimbDay";
import { todayYmd } from "@/lib/date";
import { HowTo } from "@/components/ui/HowTo";
import { SortList } from "@/components/ui/SortList";
import { ScrollList } from "@/components/ui/ScrollList";
import { AppVersion } from "@/components/ui/Version";
import { FeedbackItem, FeedbackList } from "@/components/ui/Feedback";
import { PickList } from "@/components/ui/PickList";
import { GrantGroup, GrantList, GrantRow } from "@/components/ui/Grant";
import { HighpointPicker, NumberMarks } from "@/components/ui/Endurance";
import { Tabs } from "@/components/ui/Tabs";
import { HighlightCard, InsightPill, InsightRouteRow, MeterList, MeterRow, SplitBar } from "@/components/ui/Insights";
import { HoldLegend, HoldMarks, HoldTools, PhotoThumb, RouteThumb, SprayRow } from "@/components/ui/Spray";
import { ClimberEditor, ClimberHead } from "@/components/ui/Climber";
import { CharacterTop, MascotAvatar, MascotBubble, MascotBuddyView, MascotColors, MascotPicker, MascotToastView } from "@/components/ui/Mascot";
import { Avatar, HexChart, ProfileCardView } from "@/components/ui/Profile";
import { LogList, LogRow } from "@/components/ui/Log";
import { ClosedNotice, CommentForm, CommentItem, CommentList, PrivateHint } from "@/components/ui/Comments";
import FloorPlan from "@/components/ui/FloorPlan";
import { Check, ColorPicker, GradePicker, Label, MultiOptionGrid, OptionGrid, Rating, Segmented, TagPicker, TextArea, TextField, Toggle } from "@/components/ui/Form";
import { BandHeading, BandPicker, GoalLine, GradeChart, GymRow, NewRouteCard, NewRouteRow, RopeChart, SoonBox, SwipeHint, ZoneCard, ZoneGradeCard, ZoneList, ZoneNav } from "@/components/ui/Gym";
import { GymDot, ResetDateRow, ResetLines, ResetMonth } from "@/components/ui/Resets";
import { newRoutesText, type ResetEvent } from "@/lib/resets";
import { CommentCount, Grade, HoldDot, Points, RouteList, RouteRow, RouteTag, SetterNote, StatusBadge, StatusPicker, Tags, Tape, VideoCount } from "@/components/ui/Route";
import Sheet, { SheetSection, SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { GymLegend, ProgressCard } from "@/components/ui/Progress";
import { SlamTicket } from "@/components/ui/Slam";
import { AccountSummary, ResetCodeBox, SuspendedLine, SuspendNotice, ToggleButton } from "@/components/ui/Account";
import { CalendarHeat, DailyBars, DaySummary, Delta, MonthGradeChart, MonthSwitcher, SetBox, StatGrid, StatTile, TotalRow, TrendBars } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { BetaBadge, BetaBar, PickedFile, VideoList, VideoPickButton, VideoResult, VideoRow, VideoStrip, VideoTrim, VideoViewer, type VideoCard } from "@/components/ui/Video";
import { Pin, TempPin, WallPhoto } from "@/components/ui/Wall";
import { fakeWall } from "@/lib/demo";
import {
  CLIMB_MOVES,
  FEEL,
  FEEL_TAG_MAX,
  FEEL_TAGS,
  GRADE_BANDS,
  ROPE_BANDS,
  GRADE_FEEL,
  GRADES,
  HEIGHT_BANDS,
  HOLD_COLOR_NAMES,
  inBand,
  type BandId,
  type ClimbMove,
  type FeelTag,
  type HeightBand,
  type HoldColor,
  type Status,
} from "@/lib/design";
import { MINGDE_PLAN } from "@/lib/floorplan";
import { GYMS, LIVE_GYM } from "@/lib/gyms";
import { DEFAULT_CLIMBER, randomClimber, type Climber } from "@/lib/climber";
import { MASCOT_MODES, MASCOTS, type MascotMode, type MascotPick } from "@/lib/mascots";
import { ReportAction, ReportCount, ReportItem, ReportLink, ReportList, ReportMark, ReportSpot } from "@/components/ui/Report";
import { ShareButton, ShareOffer, SharePicker, SharePreview } from "@/components/ui/Share";
import { SHOW_DEFAULT } from "@/lib/share-options";

type DemoRoute = { code: string; grade: number; color: HoldColor; tags: string[]; x: number; y: number; status: Status | null; isNew: boolean; comments: number; videos: number };

const ZONES = [
  { code: "A", name: "A 區", done: 9, total: 20, resetDays: 5, seed: 100 },
  { code: "W", name: "比賽牆", done: 2, total: 10, resetDays: 24, seed: 101 },
  { code: "B", name: "B 區", done: 11, total: 16, resetDays: 12, seed: 102 },
  { code: "C", name: "C 區", done: 13, total: 14, resetDays: 33, seed: 103 },
  { code: "D", name: "D 區", done: 0, total: 10, resetDays: 48, seed: 104 },
];
// 平面圖示範：明德館的區域代碼（A1–A4、W1–W4、B1–B3、C1–C3、D1–D2），條數有多有少（立體時高低不同），C1 5 天後換線（報讀會唸，圖上不畫）、A3 剛換線（0 條）
const PLAN_ZONES = (
  [
    ["A1", 6, 12], ["A2", 9, 15], ["A3", 0, 0], ["A4", 3, 8],
    ["W1", 2, 10], ["W2", 5, 6], ["W3", 1, 4], ["W4", 7, 18],
    ["B1", 4, 9], ["B2", 11, 14], ["B3", 2, 5],
    ["C1", 8, 20], ["C2", 1, 3], ["C3", 6, 11],
    ["D1", 0, 10], ["D2", 5, 7],
  ] as const
).map(([code, done, total]) => ({ code, name: `${code} 區`, done, total, resetDays: code === "C1" ? 5 : 30 }));
// 區域卡片的難度色帶示範（每條路線的難度，由易到難；10 = V10 還沒定膠帶顏色）
const ZONE_GRADES: Record<string, number[]> = {
  A: [-1, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 6, 6, 7, 8, 9, 10],
  W: [6, 6, 7, 7, 8, 8, 9, 9, 10, 10],
  B: [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7, 8],
};

const STATUSES: (Status | null)[] = ["flash", "send", null, "send", "project", null, "send", null, null, "flash"];
const TAGS = [["力量"], ["技巧", "平衡"], ["腳法"], ["動態"], ["指力"], [], ["協調", "柔軟"], ["耐力"], ["平衡"], ["技巧"]];

// 換線日示範（今天當作 2026/10/9）
const DEMO_TODAY = "2026-10-09";
const DEMO_RESETS: ResetEvent[] = [
  { id: "r1", gym_id: "mingde", label: "比賽牆", zone_ids: [], starts_on: "2026-10-07", ends_on: "2026-10-08", spray: false },
  { id: "r2", gym_id: "mingde", label: "D 區", zone_ids: [], starts_on: "2026-10-12", ends_on: "2026-10-12", spray: false },
  { id: "r3", gym_id: "g2", label: "C 區", zone_ids: [], starts_on: "2026-10-12", ends_on: "2026-10-13", spray: false },
  { id: "r4", gym_id: "mingde", label: "B 區", zone_ids: [], starts_on: "2026-10-15", ends_on: "2026-10-16", spray: false },
  { id: "r5", gym_id: "g3", label: "Auto-Belay", zone_ids: [], starts_on: "2026-10-09", ends_on: "2026-10-10", spray: false },
  { id: "r6", gym_id: "g2", label: "教學區 Slab 區", zone_ids: [], starts_on: "2026-10-20", ends_on: "2026-10-20", spray: false },
  { id: "r7", gym_id: "g3", label: "D 區", zone_ids: [], starts_on: "2026-10-28", ends_on: "2026-10-29", spray: false },
  { id: "r8", gym_id: "g4", label: "C 區", zone_ids: [], starts_on: "2026-10-31", ends_on: "2026-11-01", spray: false },
];

const DEMO_VIDEOS: VideoCard[] = [
  { key: "1", name: "小安", ago: "10/05", status: "flash", caption: "第三手用左腳勾", duration: 42, feel: "🤏 手指超痛・🦶 精準腳法", tags: "身高 160–169cm・靜態" },
  { key: "2", name: "阿明", ago: "今天", status: "send", caption: "最後一手要果斷", duration: 28, feel: "💪 力量感", tags: "身高 170–179cm・動態" },
  { key: "3", name: "我", ago: "3 天前分享", status: "project", duration: 19, meta: "B 區 B-03" },
];

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex items-center gap-2.5 text-meta">
      <span className="size-8 flex-none rounded-cell shadow-[inset_0_0_0_1px_rgba(0,0,0,.15)]" style={{ background: `var(${varName})` }} />
      <span>
        <b className="block text-ink">{name}</b>
        <span className="text-muted">{varName}</span>
      </span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

export default function DesignShowcase() {
  const toast = useToast();
  const wall = useMemo(() => fakeWall(100), []);
  const routes: DemoRoute[] = useMemo(
    () =>
      wall.holds.slice(0, 10).map((h, i) => ({
        code: `A-${String(i + 1).padStart(2, "0")}`,
        grade: [0, 1, 2, 3, 3, 4, 5, 5, 6, 7][i],
        color: h.c,
        tags: TAGS[i],
        x: h.x,
        y: h.y,
        status: STATUSES[i],
        isNew: i < 3,
        comments: [2, 0, 1, 0, 3, 0, 0, 1, 0, 0][i],
        videos: [1, 0, 0, 2, 4, 0, 0, 0, 1, 0][i],
      })),
    [wall]
  );

  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  const [grade, setGrade] = useState<number | null>(null);
  const [climbDay, setClimbDay] = useState(todayYmd());
  const [sharePv, setSharePv] = useState(false);
  const [sendShow, setSendShow] = useState(SHOW_DEFAULT.send);
  const [color, setColor] = useState<HoldColor | null>(null);
  const [setter, setSetter] = useState(false);
  const [temp, setTemp] = useState<{ x: number; y: number } | null>(null);
  const [sheetRoute, setSheetRoute] = useState<DemoRoute | null>(null);
  const [status, setStatus] = useState<Status | null>("send");
  const [feel, setFeel] = useState<number | null>(2);
  const [gfeel, setGfeel] = useState<number | null>(0);
  const [consent, setConsent] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [liked, setLiked] = useState(false);
  const [videoLiked, setVideoLiked] = useState<Record<string, boolean>>({});
  // 影片的讚：第一支沒人按（寫「讚」），之後幾支有人按過
  const likedVideos: VideoCard[] = DEMO_VIDEOS.map((v, i) => ({
    ...v,
    likes: i + (videoLiked[v.key] ? 1 : 0),
    liked: !!videoLiked[v.key],
    onLike: () => setVideoLiked((m) => ({ ...m, [v.key]: !m[v.key] })),
  }));
  const [demoTab, setDemoTab] = useState<"log" | "video" | "comment">("log");
  const [rate, setRate] = useState<number | null>(3);
  const [trendPick, setTrendPick] = useState<number | null>(null);
  const [holdType, setHoldType] = useState<"s" | "h" | "t">("s");
  const [holdSize, setHoldSize] = useState<1 | 2 | 3>(2);
  const [order, setOrder] = useState(["A 區", "比賽牆", "B 區", "C 區"]);
  const [pickColor, setPickColor] = useState<HoldColor>("紅");
  const [pickPerson, setPickPerson] = useState<string | null>("a");
  const [grantGyms, setGrantGyms] = useState<string[]>(["g2"]);
  const [seq, setSeq] = useState(() => Array.from({ length: 12 }, (_, i) => ({ x: 8 + i * 7.5, y: 70 - i * 3.5 + (i % 2 ? 6 : 0) })));
  const [hp, setHp] = useState<number | null>(7);
  const [grantResets, setGrantResets] = useState(true);
  const [pickGrade, setPickGrade] = useState(3);
  const [pickTags, setPickTags] = useState<string[]>(["技巧"]);
  const [toggle, setToggle] = useState(true);
  const [draft, setDraft] = useState("");
  const [month, setMonth] = useState(9);
  const [pickDay, setPickDay] = useState<number | null>(23);
  const [bandId, setBandId] = useState<BandId | null>("mid");
  const [ropeId, setRopeId] = useState<BandId | null>(null);
  const [zoneBandId, setZoneBandId] = useState<BandId | null>(null);
  const [resetDay, setResetDay] = useState("2026-10-12");
  const [videoTag, setVideoTag] = useState<string | null>(null);
  const [trimDemo, setTrimDemo] = useState<[number, number]>([12, 53.5]);
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const [pinFocus, setPinFocus] = useState(false);
  const [calDay, setCalDay] = useState<{ d: number; open: boolean } | null>({ d: 23, open: false });
  const [muteDemo, setMuteDemo] = useState(false);
  const [pickHeight, setPickHeight] = useState<HeightBand | null>("170s");
  const [pickMove, setPickMove] = useState<ClimbMove | null>("dynamic");
  const [pickFeel, setPickFeel] = useState<FeelTag[]>(["fingers", "risky"]);
  const band = GRADE_BANDS.find((b) => b.id === bandId) ?? null;
  const ropeBand = ROPE_BANDS.find((b) => b.id === ropeId) ?? null;
  const zoneBand = GRADE_BANDS.find((b) => b.id === zoneBandId) ?? null;

  const match = (r: DemoRoute) => inBand(r.grade, zoneBand) && (color == null || r.color === color);
  const ydsGrades = [102, 104, 105, 107, 108];
  const colors = [...new Set(routes.map((r) => r.color))];
  const counts: Record<number, number> = { 2: 1, 5: 3, 9: 5, 12: 2, 16: 4, 19: 1, 23: 6, 26: 2, 29: 3 };
  const calGyms: Record<number, string[]> = { 2: ["g2"], 5: ["mingde"], 9: ["mingde"], 12: ["g3"], 16: ["mingde"], 19: ["g4"], 23: ["mingde", "g2"], 26: ["g5"], 29: ["mingde"] };

  const openRoute = (r: DemoRoute) => {
    setSheetRoute(r);
    setStatus(r.status ?? null);
  };

  return (
    <>
      <Header gym={LIVE_GYM} />
      <PageTitle sub="所有共用元件，資料都是示範用。對照 prototype/mingde-routes.html">元件展示</PageTitle>

      <ChipRow>
        {(["auto", "light", "dark"] as const).map((t) => (
          <Chip key={t} pressed={theme === t} onClick={() => setTheme(t)}>
            {{ auto: "跟隨系統", light: "淺色", dark: "深色" }[t]}
          </Chip>
        ))}
      </ChipRow>

      <Block title="顏色">
        <div className="grid grid-cols-2 gap-3 rounded-card bg-surface p-3.5 shadow-card">
          <Swatch name="主色 原岩酒紅" varName="--accent" />
          <Swatch name="Flash 黃" varName="--flash" />
          <Swatch name="淡酒紅" varName="--accent-soft" />
          <Swatch name="淡粉" varName="--blush" />
          <Swatch name="警示" varName="--warn" />
          <Swatch name="文字" varName="--ink" />
          <Swatch name="次要文字" varName="--muted" />
          <Swatch name="線條" varName="--line" />
          <Swatch name="頁面底色" varName="--bg" />
          <Swatch name="卡片" varName="--surface" />
          <Swatch name="凹陷底色" varName="--sunk" />
        </div>
        <div className="mt-3 grid grid-cols-6 gap-2">
          {HOLD_COLOR_NAMES.map((c) => (
            <div key={c} className="grid justify-items-center gap-1 text-tiny text-muted">
              <HoldDot color={c} className="size-7" />
              {c}
            </div>
          ))}
        </div>
      </Block>

      <Block title="字體與字級">
        <div className="grid gap-1 rounded-card bg-surface p-3.5 shadow-card">
          <span className="text-title font-black">大標 30 / 900</span>
          <span className="text-sheet font-bold">面板標題 22 / 700</span>
          <span className="text-section font-bold">區塊標題 17 / 700</span>
          <span className="text-body">內文 16 / 400 Noto Sans TC</span>
          <span className="text-sub text-muted">副標 15 次要文字</span>
          <span className="text-meta text-muted">小字 13</span>
          <span className="text-tiny text-muted">最小字 12</span>
          <span className="flex items-end gap-3 font-num font-bold">
            <span className="text-num-sheet">V7</span>
            <span className="text-num-stat">34</span>
            <span className="text-num-row">V5</span>
            <span className="text-num-card">V3</span>
            <span className="text-num-bar">V2</span>
            <span className="text-num-pin">4</span>
          </span>
          <span className="text-meta text-muted">數字與難度：Barlow Condensed 600 / 700</span>
        </div>
      </Block>

      <Block title="按鈕">
        <Button variant="primary" onClick={() => toast("已儲存紀錄")}>
          主要按鈕（點我看提示）
        </Button>
        <Button>一般按鈕</Button>
        <Button variant="danger">整區換線（下架全部 12 條）</Button>
        <LinkButton>取消</LinkButton>
        <BackLink>明德館</BackLink>
      </Block>

      <Block title="狀態">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="flash" />
          <StatusBadge status="send" />
          <StatusBadge status="project" />
          <StatusBadge status="send" old />
          <Tags tags={["力量", "技巧"]} />
        </div>
        <div className="mt-3">
          <StatusPicker value={status} onChange={setStatus} />
        </div>
      </Block>

      <Block title="平面圖與區域">
        <p className="mt-0 mb-1.5 text-meta text-muted">右上角「立體／平面」：立體（2.5D，預設）方塊越高路線越多；三張一起換，記在這支手機</p>
        <FloorPlan shape={MINGDE_PLAN} gymName={LIVE_GYM.name} zones={PLAN_ZONES} onSelect={(c) => toast(`點了 ${c} 區`)} />
        <p className="mt-3 mb-1.5 text-meta text-muted">管理後台（admin）：顯示路線數，粗框是目前編輯的區域</p>
        <FloorPlan admin selected="B1" shape={MINGDE_PLAN} gymName={LIVE_GYM.name} zones={PLAN_ZONES} onSelect={(c) => toast(`切換到 ${c} 區`)} />
        <p className="mt-3 mb-1.5 text-meta text-muted">沒登入（guest）：每區寫路線數、統一底色</p>
        <FloorPlan guest shape={MINGDE_PLAN} gymName={LIVE_GYM.name} zones={PLAN_ZONES} onSelect={(c) => toast(`點了 ${c} 區`)} />
        <GoalLine label="下一個目標" onClick={() => toast("進 A 區")}>
          A 區 5 天後換線，還有 11 條沒完攀
        </GoalLine>
      </Block>

      <Block title="難度色帶（館首頁的所有區域）">
        <GradeChart grades={Object.values(ZONE_GRADES).flat()} band={band} onBand={setBandId} />
        <div className="mt-3 mb-2">
          <BandPicker value={bandId} onChange={setBandId} />
        </div>
        <ZoneList>
          {ZONES.slice(0, 3).map((z, i) => (
            <ZoneCard
              key={z.code}
              photo={fakeWall(z.seed).uri}
              name={z.name}
              done={z.done}
              total={ZONE_GRADES[z.code].length}
              grades={ZONE_GRADES[z.code]}
              scale={20}
              band={band}
              fresh={i === 2}
              due={{ days: z.resetDays, ongoing: false, text: `${z.resetDays} 天後換線`, warn: z.resetDays <= 7 }}
            />
          ))}
          <ZoneCard photo={fakeWall(104).uri} name="D 區（沒登入）" done={0} total={5} grades={[0, 1, 2, 3, 4]} scale={20} band={band} guest due={{ days: 0, ongoing: true, text: "換線中・今晚起新路線", warn: true }} />
        </ZoneList>
        <p className="mt-2 mb-0 text-meta text-muted">選了難度：範圍內的色段保持粗、寫條數，其他縮成細線；整區沒有這個難度就變淡。NEW＝3 天內有新路線</p>
      </Block>

      <Block title="上攀難度分布（館首頁，有上攀或長耐力路線的館：RopeChart＋BandPicker bands=ROPE_BANDS）">
        <RopeChart title="上攀難度分布" grades={[100, 101, 102, 102, 103, 103, 103, 104, 105, 106, 106, 107, 108, 109, 110, 112, 113, 116]} band={ropeBand} onBand={setRopeId} />
        <div className="mt-3 mb-2">
          <BandPicker value={ropeId} onChange={setRopeId} bands={ROPE_BANDS} all="5.6–5.13" />
        </div>
        <ZoneCard photo={fakeWall(105).uri} name="上攀 E 區" done={2} total={6} grades={[101, 103, 104, 106, 108, 112]} scale={20} band={ropeBand} due={null} />
      </Block>

      <Block title="換線日（選館頁、換線行事曆）">
        <p className="mt-0 mb-1.5 text-meta text-muted">選館頁：館名下面寫換線中、剛換好（NEW）、之後的換線（7 天內橘色）</p>
        <div className="grid gap-2">
          {GYMS.filter((g) => g.live)
            .slice(0, 3)
            .map((g) => (
              <GymRow
                key={g.id}
                name={g.name}
                logo={g.logo}
                live
                tag=""
                selected={false}
                lines={<ResetLines events={DEMO_RESETS.filter((e) => e.gym_id === g.id)} today={DEMO_TODAY} />}
              />
            ))}
        </div>
        <p className="mt-3 mb-1.5 text-meta text-muted">換線行事曆：每間館一個顏色，兩天的畫成跨兩格的長條；點日期看細節（今天＝10/9）</p>
        <ResetMonth month="2026-10" events={DEMO_RESETS} gymName={(id) => GYMS.find((g) => g.id === id)?.name ?? ""} today={DEMO_TODAY} selected={resetDay} onSelect={setResetDay} />
        <div className="mt-2 grid gap-px overflow-hidden rounded-tile bg-line shadow-card">
          {DEMO_RESETS.filter((e) => e.starts_on <= resetDay && e.ends_on >= resetDay).map((e) => (
            <ResetDateRow
              key={e.id}
              e={e}
              title={
                <span className="inline-flex items-center gap-1.5">
                  <GymDot gymId={e.gym_id} />
                  {GYMS.find((g) => g.id === e.gym_id)?.name} {e.label}
                </span>
              }
              sub={newRoutesText(e)}
            />
          ))}
        </div>
      </Block>

      <Block title="最新路線">
        <NewRouteRow>
          {routes.slice(0, 5).map((r, i) => (
            <NewRouteCard key={r.code} color={r.color} grade={r.grade} zone="A 區" ago={i === 0 ? "今天" : `${i} 天前`} onClick={() => openRoute(r)} />
          ))}
        </NewRouteRow>
      </Block>

      <Block title="區域頁：上一區／下一區（左右滑動換區）">
        <p className="mt-0 mb-1.5 text-meta text-muted">標題下面左右兩個方框（上面小字、下面區名）；往左滑到下一區、往右滑到上一區，滑的時候螢幕邊緣出現要去的那一區</p>
        <ZoneNav prev="A1 區" next="A3 區" onGo={(d) => toast(d === "prev" ? "上一區" : "下一區")} />
        <p className="mt-0 mb-1.5 text-meta text-muted">第一區（只有下一區）、最後一區（只有上一區）、改過的長名字截短</p>
        <ZoneNav next="比賽牆 1" onGo={() => toast("下一區")} />
        <ZoneNav prev="非常非常長的區域名字一二三四五六七八" onGo={() => toast("上一區")} />
        {/* 示範用：平常固定在螢幕邊緣，這裡放進框裡 */}
        <div className="relative h-14 translate-x-0 overflow-hidden rounded-tile bg-sunk">
          <SwipeHint dir="prev" name="A1 區" />
          <SwipeHint dir="next" name="A3 區" />
        </div>
      </Block>

      <Block title="區域頁：照片、難度色帶、篩選、分段列表（版型固定）">
        <Toggle checked={setter} onChange={setSetter} label="管理模式（點照片新增）" />
        <Toggle checked={pinFocus} onChange={setPinFocus} label="New~ 看路線跳過來（標出第一條：Pin focus）" />
        <WallPhoto src={wall.uri} alt="A 區照片" setter={setter} hideable={!setter} onPick={(x, y) => setTemp({ x, y })}>
          {routes.map((r, i) => (
            <Pin
              key={r.code}
              focus={pinFocus && i === 0}
              x={r.x}
              y={r.y}
              color={r.color}
              grade={r.grade}
              status={r.status === "project" ? null : r.status}
              dim={pinFocus ? i !== 0 : !match(r)}
              label={`V${r.grade} ${r.color}色 ${r.code}`}
              onClick={() => openRoute(r)}
            />
          ))}
          {temp && <TempPin x={temp.x} y={temp.y} />}
        </WallPhoto>
        <ZoneGradeCard name="A 區" grades={routes.map((r) => r.grade)} band={zoneBand} />
        <div className="mt-3 mb-2">
          <BandPicker value={zoneBandId} onChange={setZoneBandId} />
        </div>
        <Tip>{zoneBand ? `只列 ${zoneBand.range}，照片上其他難度的路線變淡。` : "色帶是牆上的膠帶顏色，數字是這個難度有幾條。"}</Tip>
        <HowTo
          id="design"
          title="顏色和分數怎麼看"
          lines={["照片上的圓點：顏色是岩點的顏色，數字是難度", "難度標籤（例如 V3）的顏色是牆上膠帶的顏色", "Flash：第一次嘗試就完攀，分數 ×1.2"]}
        />
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
        {GRADE_BANDS.map((b) => {
          const rs = routes.filter(match).filter((r) => inBand(r.grade, b));
          return (
            rs.length > 0 && (
              <section key={b.id}>
                <BandHeading band={b} count={rs.length} />
                <RouteList>
                  {rs.map((r) => (
                    <RouteRow
                      key={r.code}
                      color={r.color}
                      grade={r.grade}
                      title={`${r.color}色 ${r.code}`}
                      isNew={r.isNew}
                      status={r.status}
                      meta={
                        <>
                          <Tags tags={r.tags} /> 3 天前
                          {r.videos > 0 && <VideoCount n={r.videos} />}
                          {r.comments > 0 && <CommentCount n={r.comments} />}
                        </>
                      }
                      onClick={() => openRoute(r)}
                    />
                  ))}
                </RouteList>
              </section>
            )
          );
        })}
        <p className="mt-4 mb-1.5 text-meta text-muted">這一區沒有的難度段變淡、點不了（missing，這裡是沒有 V6+ 的區）</p>
        <BandPicker value={null} onChange={() => {}} missing={["hard"]} />
        <p className="mt-4 mb-1.5 text-meta text-muted">YDS、長耐力的區：沒有膠帶顏色，難度篩選用一個一個難度的小按鈕，路線不分段</p>
        <ChipRow>
          <Chip num pressed={grade == null} onClick={() => setGrade(null)}>
            全部
          </Chip>
          {ydsGrades.map((g) => (
            <GradeChip key={g} grade={g} pressed={grade === g} onClick={() => setGrade(g)} />
          ))}
        </ChipRow>
      </Block>

      <Block title="路線卡片（底部彈出）">
        <Button variant="primary" onClick={() => openRoute(routes[1])}>
          打開路線卡片
        </Button>
      </Block>

      <Block title="分享到 IG（ShareButton、ShareOffer、SharePreview、SharePicker）">
        <ShareButton onClick={() => setSharePv(true)}>分享到 IG</ShareButton>
        <div className="mt-3">
          <ShareOffer title={<b>影片已分享到原岩，也可以發到 IG</b>} button="也分享到 IG（加上原岩標記）" hint="左下角加上難度和館名，大約等影片的長度" onClick={() => setSharePv(true)} />
        </div>
        <SharePreview open={sharePv} onClose={() => setSharePv(false)} title="分享完攀到 IG" what="圖片" file={null} image={null} progress={0.4} note="預覽：圖做好之前顯示製作進度" />
        <SharePicker kind="send" show={sendShow} onChange={setSendShow} />
      </Block>

      <Block title="路線回報（ReportLink、ReportSpot、ReportMark、ReportItem）">
        <ReportLink>找不到你爬的路線？回報給定線員</ReportLink>
        <div className="relative mt-2 mb-3 h-24 rounded-tile bg-sunk">
          <ReportSpot x={25} y={50} color="紫" />
          <ReportMark x={55} y={50} color="橙" count={2} selected label="回報：沒標到的路線" />
          <ReportMark x={80} y={50} count={1} label="回報：位置標錯" />
        </div>
        <h4 className="mb-2 text-sub font-bold">
          路線回報
          <ReportCount n={3} />
        </h4>
        <ReportList>
          <ReportItem
            selected
            title="沒標到的路線：橙色・猜 V4"
            meta="A1 區・2 人回報・小安、阿凱・3 小時前"
            notes={[{ who: "小安", text: "從右下角的大斜面點起步" }]}
            actions={
              <>
                <ReportAction main>＋ 新增這條</ReportAction>
                <ReportAction>已經有了</ReportAction>
                <ReportAction>不是路線</ReportAction>
              </>
            }
          />
          <ReportItem title="已經拆了：A1-03（黃色 V2）" meta="A1 區・阿凱・昨天" notes={[]} actions={<><ReportAction main>下架這條</ReportAction><ReportAction>沒問題</ReportAction></>} />
        </ReportList>
      </Block>

      <Block title="管理後台表單">
        <SetBox>
          <Toggle checked={toggle} onChange={setToggle} label="開放顧客留言" hint="關閉後全館路線都不能留言" />
        </SetBox>
        <SetBox>
          <Label htmlFor="zn">區域名稱</Label>
          <TextField id="zn" defaultValue="A 區" />
          <Label>岩點顏色</Label>
          <ColorPicker value={pickColor} onChange={setPickColor} />
          <Label>難度</Label>
          <GradePicker value={pickGrade} onChange={setPickGrade} />
          <Label>路線風格（可複選）</Label>
          <TagPicker value={pickTags} onChange={setPickTags} />
          <Label htmlFor="rn">評語（選填）</Label>
          <TextField id="rn" maxLength={40} placeholder="例如：最後一手要果斷" />
        </SetBox>
        <Tip>點空白處新增，點標記編輯、管理留言或下架。</Tip>
        <LogList>
          <LogRow time="10/05 14:32" text="A 區整區換線，下架 12 條" who="阿定" />
          <LogRow time="10/04 20:11" text="刪除 小安 在 A-07 的留言「這條好難」" who="店長" />
          <LogRow time="10/03 09:02" text="修改計分規則（Flash ×1.2、風格加成上限 30%）" who={null} />
        </LogList>
      </Block>

      <Block title="我的紀錄">
        <MonthSwitcher year={2026} month={month} onPrev={() => setMonth((m) => Math.max(1, m - 1))} onNext={() => setMonth((m) => Math.min(9, m + 1))} nextDisabled={month === 9} />
        <StatGrid>
          <StatTile value={27} label="完攀" />
          <StatTile value={6} label="Flash" flash />
          <StatTile value={9} label="攀爬天數" />
          <StatTile value="V6" label="最高難度" />
        </StatGrid>
        <Delta diff={4} />
        <SectionTitle>攀爬日</SectionTitle>
        <CalendarHeat
          year={2026}
          month={month}
          counts={counts}
          today={month === 9 ? 30 : undefined}
          gyms={calGyms}
          picked={calDay?.d ?? null}
          onPick={(d) => setCalDay(d ? { d, open: false } : null)}
        />
        {calDay && (
          <DaySummary
            title={`9/${calDay.d}（點一天：DaySummary）`}
            sends={counts[calDay.d] ?? 0}
            flashes={1}
            points={86}
            gyms={calGyms[calDay.d].map((g, i) => ({ gym: g, sends: i ? 1 : (counts[calDay.d] ?? 1) - (calGyms[calDay.d].length - 1), grades: i ? [{ label: "V7", n: 1 }] : [{ label: "V1", n: 2 }, { label: "V2", n: 3 }], more: i ? "岩友路線 1 條" : undefined }))}
            open={calDay.open}
            onOpen={() => setCalDay({ d: calDay.d, open: true })}
            onClose={() => setCalDay(null)}
          >
            <RouteList>
              <RouteRow color="藍" grade={2} title="A 區 藍色" meta="9/23" status="flash" />
            </RouteList>
          </DaySummary>
        )}
        <SectionTitle>本月完攀（MonthGradeChart）</SectionTitle>
        <MonthGradeChart
          title="抱石"
          picked={monthPick}
          onPick={setMonthPick}
          cols={[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => {
            const [sends, flashes] = ({ 1: [3, 3], 2: [5, 4], 3: [2, 0], 4: [1, 0], 5: [1, 1] } as Record<number, number[]>)[g] ?? [0, 0];
            return { key: `v:${g}`, label: g < 0 ? "VB" : `V${g}`, grade: g, sends, flashes, items: sends };
          })}
        />
        <MonthGradeChart
          title="上攀"
          tone="accent"
          picked={monthPick}
          onPick={setMonthPick}
          cols={["5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12", "5.13"].map((label, i) => {
            const [sends, flashes] = ({ 3: [1, 1], 4: [2, 0] } as Record<number, number[]>)[i] ?? [0, 0];
            return { key: `y:${i}`, label, grade: 100 + i, sends, flashes, items: sends };
          })}
        />
        <p className="mt-0 mb-1.5 text-meta text-muted">點一根選它（其他變淡）、再點一次取消；沒有紀錄的那根點不了</p>
        <SectionTitle>每日積分</SectionTitle>
        <div className="rounded-tile bg-surface px-3.5 pt-3 pb-2.5 shadow-card">
          <p className="mt-0 mb-2 flex justify-between text-meta text-muted">
            <span>每日積分</span>
            <span>
              {month}/{pickDay}　<b className="font-num text-[17px] text-ink">{pickDay ? ({ 2: 20, 5: 95, 9: 180, 12: 60, 16: 140, 19: 30, 23: 220, 26: 70, 29: 110 } as Record<number, number>)[pickDay] ?? 0 : 0}</b> 分
            </span>
          </p>
          <DailyBars
            year={2026}
            month={month}
            points={{ 2: 20, 5: 95, 9: 180, 12: 60, 16: 140, 19: 30, 23: 220, 26: 70, 29: 110 }}
            today={month === 9 ? 30 : undefined}
            selected={pickDay}
            onSelect={setPickDay}
          />
        </div>
        <p className="mt-3 text-meta text-muted">
          路線分數：藍色 A-02<Points n={50} />　得分<Points prefix="+" n={60} />
        </p>
        <TotalRow label="累計完攀" value={143} />
        <SectionTitle>路線進度（GymLegend、GymBar、ProgressCard）</SectionTitle>
        <p className="mt-0 mb-1.5 text-meta text-muted">牆上進度：依館分段（各店標準色）、灰底是還沒完成的；全部完成寫「★ 大滿貫」；點一行展開各館</p>
        <GymLegend gyms={["mingde", "g2", "g3", "g4", "g5"]} />
        <ProgressCard
          title="抱石"
          mode="wall"
          rows={[
            { grade: -1, done: 4, total: 4, gyms: [{ gym: "mingde", done: 2, total: 2 }, { gym: "g2", done: 1, total: 1 }, { gym: "g4", done: 1, total: 1 }] },
            { grade: 3, done: 5, total: 12, gyms: [{ gym: "mingde", done: 3, total: 5 }, { gym: "g2", done: 1, total: 4 }, { gym: "g5", done: 1, total: 3 }] },
            { grade: 6, done: 0, total: 6, gyms: [{ gym: "mingde", done: 0, total: 4 }, { gym: "g4", done: 0, total: 2 }] },
          ]}
        />
        <p className="mt-0 mb-1.5 text-meta text-muted">大滿貫兌換（活動開著，或老闆）：大滿貫那一行右邊是「★ 兌換 ›」，兌換過寫「★ 已兌換」；點一行其他地方照舊展開</p>
        <ProgressCard
          title="抱石"
          mode="wall"
          slam={(r) => (r.grade === 5 ? "claim" : r.grade === 4 ? "redeemed" : null)}
          onSlam={() => undefined}
          rows={[
            { grade: 4, done: 12, total: 12, gyms: [{ gym: "mingde", done: 7, total: 7 }, { gym: "g2", done: 5, total: 5 }] },
            { grade: 5, done: 21, total: 21, gyms: [{ gym: "mingde", done: 9, total: 9 }, { gym: "g3", done: 6, total: 6 }, { gym: "g5", done: 6, total: 6 }] },
          ]}
        />
        <p className="mt-0 mb-1.5 text-meta text-muted">大滿貫兌換卡（SlamTicket）：膠帶顏色＋大難度、會動的條紋、QR code、兌換碼、現在時間（秒在跳）；截圖的話條紋和時間不會動</p>
        <SlamTicket
          grade={5}
          total={21}
          achievedOn="2026/10/12"
          nickname="小岩"
          code="K7Q4-82MD"
          qr="https://example.com/redeem?c=K7Q482MD"
          prize={null}
          expires="2026/11/11"
        />
        <p className="mt-3 mb-1.5 text-meta text-muted">已兌換：上半段變灰、條紋停住、QR code 蓋章</p>
        <SlamTicket
          grade={9}
          total={10}
          achievedOn="2026/10/12"
          nickname="小岩"
          code="K7Q4-82MD"
          qr="https://example.com/redeem?c=K7Q482MD"
          prize="原岩毛巾"
          expires="2026/11/11"
          redeemed={{ when: "10/14 19:42", gym: "明德館" }}
        />
        <p className="mt-3 mb-1.5 text-meta text-muted">我的進度：累積完攀幾條，沒有總數所以不畫灰底，最多的那個難度畫滿</p>
        <ProgressCard
          title="上攀"
          mode="mine"
          rows={[
            { grade: 101, done: 8, total: 8, gyms: [{ gym: "g3", done: 5, total: 5 }, { gym: "g5", done: 3, total: 3 }] },
            { grade: 104, done: 3, total: 3, gyms: [{ gym: "g3", done: 2, total: 2 }, { gym: "g5", done: 1, total: 1 }] },
          ]}
        />
      </Block>

      <Block title="帳號管理（停權、重設密碼）">
        <p className="mt-0 mb-1.5 text-meta text-muted">被停權的人每一頁最上面的提示條（SuspendNotice，2A 案）；永久停權寫「帳號已停權」</p>
        <SuspendNotice until="2027-01-22T10:00:00+08:00" reason="留言騷擾其他顧客" />
        <SuspendNotice until={null} reason="發廣告" />
        <p className="mt-3 mb-1.5 text-meta text-muted">後台「帳號管理」搜尋結果（AccountSummary）：核對身分用的最近完攀、停權中（SuspendedLine）</p>
        <AccountSummary
          nickname="阿明"
          username="aming88"
          meta="註冊 10/12・紀錄 14・留言 3・影片 1"
          recent={[
            { gym: "明德館", zone: "B 區", code: "B-07", color: "藍", grade: 4 },
            { gym: "明德館", zone: "A1 區", code: "A1-03", color: "紅", grade: 3 },
          ]}
          suspension={<SuspendedLine until="2027-01-22T10:00:00+08:00" reason="留言騷擾其他顧客" by="王店長" at="2026-10-15T10:00:00+08:00" />}
        >
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <ToggleButton on={false} onClick={() => undefined}>
              看留言
            </ToggleButton>
            <ToggleButton on warn onClick={() => undefined}>
              停權中…
            </ToggleButton>
            <ToggleButton on={false} onClick={() => undefined}>
              重設密碼
            </ToggleButton>
            <ToggleButton on={false} warn onClick={() => undefined}>
              刪帳號…
            </ToggleButton>
          </div>
        </AccountSummary>
        <p className="mt-3 mb-1.5 text-meta text-muted">櫃檯產生的重設碼（ResetCodeBox）：大字、倒數、請客人怎麼做</p>
        <ResetCodeBox code="482917" left="14:52 內有效" username="aming88" />
      </Block>

      <Block title="路線卡片：點一下就記錄＋分頁">
        <p className="mt-0 mb-1.5 text-meta text-muted">攀爬日膠囊（ClimbDay）：預設今天，點開今天／昨天／前天／選日期</p>
        <ClimbDay value={climbDay} min="2026-01-01" max={todayYmd()} onChange={setClimbDay} />
        <StatusPicker compact value={status} onChange={setStatus} />
        <Tabs
          tabs={[
            { key: "log", label: "紀錄" },
            { key: "video", label: "影片", count: 3 },
            { key: "comment", label: "留言", count: 1 },
          ]}
          value={demoTab}
          onChange={setDemoTab}
        />
        <Label>爬起來的感覺（小）</Label>
        <Segmented small options={FEEL} value={feel} onChange={setFeel} />
      </Block>

      <Block title="留言很多時：左右滑動">
        <CommentList scroll>
          <CommentItem name="我" ago="今天" body="腳踩對就很簡單" edited onEdit={() => toast("編輯")} onDelete={() => toast("已刪除留言")} likes={2} />
          <CommentItem name="小安" ago="2 天前" body="第三手好遠，矮個子加油" likes={5} onLike={() => toast("👍")} />
          <CommentItem name="阿明" ago="3 天前" body="起步右腳踩高一點" likes={1} onLike={() => toast("👍")} />
        </CommentList>
        <p className="-mt-1.5 mb-0 text-tiny text-muted">共 3 則，左右滑動看更多</p>
      </Block>

      <Block title="營運：授權（老闆）">
        <GrantList>
          <GrantRow name="小安" username="climber88">
            <GrantGroup label="📊 使用狀況（只看點選的館）">
              {[
                ["mingde", "明德館"],
                ["g2", "萬華館"],
                ["g3", "中和館"],
              ].map(([id, name]) => (
                <Chip
                  key={id}
                  pressed={grantGyms.includes(id)}
                  onClick={() => setGrantGyms((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))}
                >
                  {name}
                </Chip>
              ))}
            </GrantGroup>
            <GrantGroup label="📅 換線日（所有館）">
              <Chip pressed={grantResets} onClick={() => setGrantResets((v) => !v)}>
                可以輸入
              </Chip>
            </GrantGroup>
          </GrantRow>
        </GrantList>
      </Block>

      <Block title="使用狀況（營運）">
        <TrendBars
          label="最近 30 天每天使用人數"
          items={Array.from({ length: 30 }, (_, i) => {
            const v = Math.round(8 + 6 * Math.sin(i / 3) + (i % 7 === 5 ? 9 : 0));
            return { key: String(i), tick: `9/${i + 1}`, title: `9/${i + 1}：${v} 人使用`, value: v };
          })}
          selected={trendPick}
          onSelect={setTrendPick}
        />
      </Block>

      <Block title="長耐力（照順序的點、最高爬到第幾點）">
        <WallPhoto src={wall.uri} alt="長耐力路線" setter onPick={(x, y) => setSeq((p) => (p.length >= 50 ? p : [...p, { x, y }]))}>
          <NumberMarks holds={seq} reached={hp} onTap={(i) => setSeq((p) => p.filter((_, j) => j !== i))} />
        </WallPhoto>
        <HighpointPicker value={hp} total={seq.length} onChange={setHp} aside={hp ? `得 ${Math.round((17 * hp) / seq.length)} 分` : undefined} />
        <Tip>點照片加下一點、點圈圈刪掉；第 1 點綠、最後一點紅；拉桿子選最高爬到第幾點（之後的點變淡）。</Tip>
      </Block>

      <Block title="Spray Wall">
        <HoldTools type={holdType} size={holdSize} onType={setHoldType} onSize={setHoldSize} />
        <div className="relative mb-2 aspect-[4/3] overflow-hidden rounded-tile bg-sunk shadow-card">
          <HoldMarks
            holds={[
              { x: 20, y: 82, t: "s", r: 2 },
              { x: 32, y: 60, t: "h", r: 1 },
              { x: 46, y: 42, t: "h", r: 3 },
              { x: 64, y: 16, t: "t", r: 2 },
            ]}
          />
        </div>
        <HoldLegend />
        <ScrollList>
          <SprayRow
            grade={4}
            name="下雨天的指力"
            meta="小安 出的・3 天前"
            sends={12}
            likes={8}
            done
            thumb={<RouteThumb src={wall.uri} holds={[{ x: 20, y: 82, t: "s" }, { x: 32, y: 60, t: "h" }, { x: 46, y: 42, t: "h" }, { x: 64, y: 16, t: "t" }]} />}
            onClick={() => toast("打開路線")}
          />
          <SprayRow grade={5} name="教練的岩館路線（自己的照片）" meta="明德教練 出的・今天" sends={3} likes={2} thumb={<PhotoThumb src={wall.uri} />} onClick={() => toast("打開路線")} />
          <SprayRow grade={1} name="晚餐前的熱身" meta="阿明 出的・今天" sends={0} likes={1} onClick={() => toast("打開路線")} />
          {[3, 5, 2, 6].map((g, i) => (
            <SprayRow key={g} grade={g} name={`框內滑動 ${i + 1}`} meta="路線多時整頁不會拉長" sends={i} likes={i} onClick={() => toast("打開路線")} />
          ))}
        </ScrollList>
      </Block>

      <Block title="人物卡">
        <ProfileCardView
          name="小安"
          meta="攀岩 1–3 年・常去明德館"
          bio="喜歡動態路線，正在練指力"
          chart={<HexChart actual={[40, 100, 85, 20, 60, 10]} self={[3, 4, 5, 2, 3, rate ?? 1]} />}
          stats={<>最高完攀 <b className="font-num text-ink">V6</b>・本月完攀 <b className="font-num text-ink">23</b> 條</>}
        />
        <div className="mt-3 flex items-center gap-2">
          <Avatar name="阿明" size={36} />
          <Avatar name="Climber" size={36} />
          <span className="text-meta text-muted">頭像只用暱稱第一個字</span>
        </div>
        <Rating label="柔軟" value={rate} onChange={setRate} />
      </Block>

      <Block title="原岩夥伴">
        <MascotDemo />
      </Block>

      <Block title="攀岩角色">
        <ClimberDemo />
      </Block>

      <Block title="數據分析（HighlightCard、MeterRow、SplitBar、InsightPill、InsightRouteRow）">
        <HighlightCard big="62%" title="回頭率比前一週好 5%" detail="上週用過的 40 人，這週有 25 人回來" onClick={() => toast("跳到回頭率")} />
        <div className="mt-3">
          <MeterList>
            <MeterRow label="牆上" value={34} right="34%・12 條" muted />
            <MeterRow label="完攀" value={52} right="52%・40 條" />
          </MeterList>
        </div>
        <div className="mt-3">
          <SplitBar
            label="常客分群"
            parts={[
              { label: "常客 8 天以上", n: 83 },
              { label: "偶爾 2–7 天", n: 156 },
              { label: "只來 1 天", n: 140 },
            ]}
          />
        </div>
        <ul className="mt-3 grid list-none gap-2 p-0">
          <InsightRouteRow
            grade={5}
            title="C1 區 紅色 C1-03"
            meta="38 人試、3 人完攀・完攀率 8%"
            right={
              <>
                <InsightPill tone="hard">可能太難</InsightPill>
                <InsightPill tone="plain">多人說偏硬</InsightPill>
              </>
            }
          />
          <InsightRouteRow onClick={() => toast("跳到那條路線的區域頁")} grade={3} title="A2 區 綠色 A2-07" meta="42 人試、40 人完攀・Flash 70%" right={<InsightPill tone="easy">可能太簡單</InsightPill>} />
        </ul>
      </Block>

      <Block title="拖曳排序">
        <SortList items={order.map((n) => ({ id: n, label: n }))} onChange={setOrder} />
      </Block>

      <Block title="New~（大家最新的影片）">
        <p className="mt-0 mb-1.5 text-meta text-muted">影片一列多一行「哪條路線」（VideoCard place＋RouteTag）；10/21 拿掉留言分頁，只放影片</p>
        <VideoList>
          <VideoRow
            v={{ ...DEMO_VIDEOS[0], place: <RouteTag grade={4}>中和館・抱石 A 區・A-03</RouteTag> }}
            onClick={() => toast("播放")}
          />
        </VideoList>
      </Block>

      <Block title="官方 beta（BetaBar、BetaBadge、VideoCard beta）">
        <p className="mt-0 mb-1.5 text-meta text-muted">路線卡片評語下面一條「看官方 beta」（不下載縮圖和影片，點了全螢幕播放）；影片分頁排最上面：酒紅框、「官方 beta」標籤、縮圖蓋住寫「會暴雷」</p>
        <BetaBar name="阿凱" duration={24} onClick={() => toast("播放官方 beta")} />
        <div className="mt-3">
          <VideoList>
            <VideoRow v={{ key: "beta", name: "阿凱", ago: "今天分享", duration: 24, beta: true, likes: 3, onLike: () => toast("👍") }} onClick={() => toast("播放")} />
          </VideoList>
        </div>
        <p className="mt-2 mb-0 text-meta">
          <BetaBadge /> 小標籤（全螢幕播放的名字前面也有）
        </p>
      </Block>

      <Block title="顧客影片">
        <p className="mt-0 mb-1.5 text-meta text-muted">路線卡片「影片」分頁：篩選鈕排不下就換行（ChipRow wrap），一支一列（VideoRow）；沒寫說明的標題是「某某的攀爬」；右下角「👍 讚」（VideoCard likes、liked、onLike，跟留言一樣的 LikeButton），全螢幕播放在名字那一行</p>
        <ChipRow wrap>
          <Chip pressed={videoTag == null} onClick={() => setVideoTag(null)}>
            全部<span className="ml-1 font-num opacity-60">3</span>
          </Chip>
          {["160–169cm", "170–179cm", "動態", "靜態"].map((t) => (
            <Chip key={t} pressed={videoTag === t} onClick={() => setVideoTag(videoTag === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </ChipRow>
        <VideoList>
          {likedVideos.map((v, i) => (
            <VideoRow key={v.key} v={v} onClick={() => setPlaying(i)} />
          ))}
        </VideoList>
        <p className="mt-3 mb-1.5 text-meta text-muted">後台：橫向縮圖（VideoStrip）</p>
        <VideoStrip items={DEMO_VIDEOS} onOpen={setPlaying} />
        <VideoViewer
          items={likedVideos}
          index={playing}
          onIndex={setPlaying}
          actions={() => (
            <button onClick={() => toast("已刪除影片")} className="text-meta text-warn">
              刪除這支影片
            </button>
          )}
        />
        <VideoPickButton onPick={(f) => toast(`選了 ${f.name}`)}>分享攀爬影片</VideoPickButton>
        <div className="mt-3">
          <PickedFile name="IMG_2031.MOV" size={23500000} onClear={() => toast("換一支")} />
        </div>
        <p className="mt-3 mb-0 text-meta text-muted">剪輯長度（VideoTrim）：影片超過 60 秒自動打開；拉開始、結束，最長 60 秒；下面靜音用 Toggle</p>
        <VideoTrim duration={80} start={trimDemo[0]} end={trimDemo[1]} max={60} onChange={(a, b) => setTrimDemo([a, b])} />
        <Toggle checked={muteDemo} onChange={setMuteDemo} label="靜音" hint="不放影片的聲音（例如館內音樂、旁邊的人聊天）" />
        <p className="mt-3 mb-0 text-meta text-muted">處理中（disabled）：剪輯拉桿、靜音都不能再改</p>
        <VideoTrim duration={80} start={trimDemo[0]} end={trimDemo[1]} max={60} onChange={() => {}} disabled />
        <Toggle checked={muteDemo} onChange={() => {}} label="靜音" disabled />
        <Label>你爬起來覺得？（選填，最多 2 個）— MultiOptionGrid，選滿後其他格變淡、按不了</Label>
        <MultiOptionGrid options={FEEL_TAGS} value={pickFeel} onChange={setPickFeel} max={FEEL_TAG_MAX} />
        <Label>你的身高（公分，選填）— OptionGrid cols 4，再按一次取消</Label>
        <OptionGrid cols={4} options={HEIGHT_BANDS} value={pickHeight} onChange={setPickHeight} />
        <Label>動作（選填）— OptionGrid cols 2，有小字說明</Label>
        <OptionGrid cols={2} options={CLIMB_MOVES} value={pickMove} onChange={setPickMove} />
        <p className="mt-3 mb-0 flex flex-wrap items-center gap-x-1 text-note text-muted">
          你在這條的紀錄會一起顯示：
          <VideoResult status="send" />
          <VideoResult status="flash" />
          <VideoResult status="project" />
        </p>
        <Check checked={consent} onChange={setConsent}>
          影片裡的其他人都同意入鏡，內容符合分享規範
        </Check>
      </Block>

      <Block title="其他">
        <Empty>這個月還沒有完攀紀錄。</Empty>
        <div className="mt-3">
          <SoonBox name="萬華館" backLabel="看明德館" onBack={() => toast("回明德館")} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Tape color="藍" />
          <Grade grade={4} />
          <span className="text-meta text-muted">色條＋難度</span>
        </div>
        <AppVersion className="mt-3" />
      </Block>

      <Block title="難度膠帶顏色（VB、V0–V10）">
        <div className="flex flex-wrap gap-2">
          {GRADES.map((g) => (
            <Grade key={g} grade={g} className="text-num-row w-[50px]" />
          ))}
        </div>
      </Block>

      <Block title="意見回饋">
        <FeedbackList>
          <FeedbackItem kind="idea" status="new" when="今天" meta="小安（帳號 climber88）・v1.1・明德館・iPhone iOS 18.1・Safari">
            希望可以看到每條路線的完攀率
          </FeedbackItem>
          <FeedbackItem kind="bug" status="doing" when="2 天前">
            在 LINE 裡打開會一直要重新登入
          </FeedbackItem>
          <FeedbackItem kind="other" status="done" when="1 週前">
            謝謝你們做這個 App！
          </FeedbackItem>
        </FeedbackList>
      </Block>

      <Block title="搜尋結果選取（指派員工）">
        <PickList
          items={[
            { id: "a", title: "小安", sub: "帳號 climber88" },
            { id: "b", title: "阿定", sub: "帳號 setterx", tag: "已是定線長" },
          ]}
          value={pickPerson}
          onPick={setPickPerson}
        />
      </Block>

      <Sheet open={!!sheetRoute} onClose={() => setSheetRoute(null)}>
        {sheetRoute && (
          <>
            <SheetTitle>
              <Tape color={sheetRoute.color} className="h-[34px]" />
              <Grade grade={sheetRoute.grade} className="text-num-sheet" />
              {sheetRoute.color}色
            </SheetTitle>
            <SheetSub>A 區 {sheetRoute.code}，3 天前設定</SheetSub>
            <Tags tags={sheetRoute.tags} />
            <SetterNote>最後一手要果斷</SetterNote>
            <SheetSection title="我的紀錄">
              <StatusPicker value={status} onChange={setStatus} />
              {status && (
                <>
                  <Label htmlFor="ld">日期</Label>
                  <TextField id="ld" type="date" defaultValue="2026-09-30" />
                  {status !== "project" && (
                    <>
                      <Label>爬起來的感覺</Label>
                      <Segmented options={FEEL} value={feel} onChange={setFeel} />
                      <Label>難度體感</Label>
                      <Segmented options={GRADE_FEEL} value={gfeel} onChange={setGfeel} />
                    </>
                  )}
                  <Label htmlFor="ln">心得</Label>
                  <TextArea id="ln" maxLength={300} placeholder={status === "project" ? "卡在哪一手？下次想怎麼試？" : "這條路線哪裡最有感？"} />
                  <PrivateHint />
                  <Button variant="primary" className="mt-3.5" onClick={() => { setSheetRoute(null); toast(status === "flash" ? "Flash！漂亮" : "已儲存紀錄"); }}>
                    儲存紀錄
                  </Button>
                  <LinkButton>清除紀錄</LinkButton>
                </>
              )}
            </SheetSection>
            <SheetSection title="影片" aside="1 支">
              <VideoStrip items={DEMO_VIDEOS.slice(0, 2)} onOpen={setPlaying} />
              <VideoPickButton onPick={(f) => toast(`選了 ${f.name}`)}>分享攀爬影片</VideoPickButton>
            </SheetSection>
            <SheetSection title="留言" aside="2 則">
              <CommentList>
                <CommentItem name="小安" ago="2 天前" body="第三手好遠，矮個子加油" likes={liked ? 4 : 3} liked={liked} onLike={() => setLiked(!liked)} />
                <CommentItem name="我" ago="今天" body="腳踩對就很簡單" onDelete={() => toast("已刪除留言")} />
              </CommentList>
              <CommentForm value={draft} onChange={setDraft} onSubmit={() => { setDraft(""); toast("已送出留言"); }} />
              <div className="mt-3">
                <ClosedNotice>這條路線的留言已關閉</ClosedNotice>
              </div>
            </SheetSection>
          </>
        )}
      </Sheet>

    </>
  );
}

// 攀岩角色（step48）：人物卡上半段（背景＋角色＋夥伴）、小頭像、編輯（鎖住的寫還差多少、點了跳解鎖卡）
// 這裡假設爬了 4 天、上攀 3 條、Flash 2 條、V5 以上 1 條
function ClimberDemo() {
  const [c, setC] = useState<Climber>({ ...DEFAULT_CLIMBER, hair: "pony", hairC: "brown", top: "tank", print: "hold", topC: "wanhua", pants: "crop", pantsC: "khaki" });
  const stats = { days: 4, rope: 3, flash: 2, v5: 1 };
  return (
    <>
      <CharacterTop pick={{ id: "mingde" }} climber={c} />
      <div className="mt-3 flex items-center gap-2">
        {(["short", "bob", "afro", "spiky", "long"] as const).map((h, i) => (
          <ClimberHead key={h} climber={{ ...c, hair: h, skin: "abcde"[i], hat: i === 3 ? "helmet" : "none", hatC: "orange" }} size={36} />
        ))}
        <ClimberHead climber={c} size={22} />
      </div>
      <p className="mt-1 mb-3 text-tiny text-muted">小頭像（36px、22px）：留言和影片旁邊；沒做角色的人照舊是夥伴</p>
      <ClimberEditor value={c} onChange={setC} stats={stats} onRandom={() => setC(randomClimber(stats))} />
    </>
  );
}

// 原岩夥伴：選夥伴、換色、角色卡、頭像、館首頁對話泡泡、夥伴風格（幹話：刀疤＋棒棒糖；文青：貝雷帽＋圓眼鏡＋拿鐵，40px 以下的頭像不畫拿鐵）
function MascotDemo() {
  const [pick, setPick] = useState<MascotPick>({ id: "wanhua" });
  const [mode, setMode] = useState<MascotMode>("plain");
  const [buddy, setBuddy] = useState(true);
  const [toast, setToast] = useState(0);
  return (
    <>
      <div className="mb-3">
        <Segmented small options={MASCOT_MODES} value={mode} onChange={setMode} />
      </div>
      <CharacterTop pick={pick} mode={mode} />
      <p className="mt-1 mb-1 text-tiny text-muted">還在讀的時候：</p>
      <CharacterTop pick={null} small />
      <div className="mt-3 flex items-center gap-2">
        {MASCOTS.map((m) => (
          <MascotAvatar key={m.id} pick={{ id: m.id }} size={36} mode={mode} />
        ))}
        <MascotAvatar pick={null} size={36} />
      </div>
      <p className="mt-1 mb-3 text-tiny text-muted">最後一個是還在讀的頭像（空的圓）；40px 以下文青不畫拿鐵</p>
      <MascotBubble pick={pick} mode={mode} text="慢慢來，爬完一條是一條。" onClose={() => setMode("plain")} />
      <p className="mt-1 mb-1 text-tiny text-muted">右下角小夥伴（點牠說話、「閉嘴」今天不說）：</p>
      <div className="mb-3 flex justify-end">
        <MascotBuddyView pick={pick} mode={mode} text={buddy ? "今天爬哪一區？" : null} onTap={() => setBuddy(!buddy)} onHush={() => setBuddy(false)} />
      </div>
      <Button className="mb-3" onClick={() => setToast(Date.now())}>
        模擬記錄 Flash（夥伴從上面跳出來、撒彩帶）
      </Button>
      {toast > 0 && <MascotToastView key={toast} pick={pick} mode={mode} text="Flash！一次就上，太強了吧！" party onClose={() => setToast(0)} />}
      <MascotPicker value={pick.id} onChange={(id) => setPick({ id })} mode={mode} />
      <div className="mt-3">
        <MascotColors pick={pick} onChange={setPick} />
      </div>
    </>
  );
}
