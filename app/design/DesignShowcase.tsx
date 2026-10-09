"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Header from "@/components/Header";
import { Button, LinkButton } from "@/components/ui/Button";
import { BackLink, Empty, PageTitle, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow, GradeChip } from "@/components/ui/Chip";
import { HowTo } from "@/components/ui/HowTo";
import { SortList } from "@/components/ui/SortList";
import { ScrollList } from "@/components/ui/ScrollList";
import { AppVersion } from "@/components/ui/Version";
import { FeedbackItem, FeedbackList } from "@/components/ui/Feedback";
import { PickList } from "@/components/ui/PickList";
import { Tabs } from "@/components/ui/Tabs";
import { HoldLegend, HoldMarks, HoldTools, RouteThumb, SprayRow } from "@/components/ui/Spray";
import { Avatar, HexChart, ProfileCardView } from "@/components/ui/Profile";
import { LogList, LogRow } from "@/components/ui/Log";
import { ClosedNotice, CommentForm, CommentItem, CommentList, PrivateHint } from "@/components/ui/Comments";
import FloorPlan from "@/components/ui/FloorPlan";
import { Check, ColorPicker, GradePicker, Label, Rating, Segmented, TagPicker, TextArea, TextField, Toggle } from "@/components/ui/Form";
import { BandPicker, GoalLine, GradeChart, NewRouteCard, NewRouteRow, ResetList, SoonBox, ZoneCard, ZoneList } from "@/components/ui/Gym";
import { CommentCount, Grade, HoldDot, Points, RouteList, RouteRow, SetterNote, StatusBadge, StatusPicker, Tags, Tape } from "@/components/ui/Route";
import Sheet, { SheetSection, SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { CalendarHeat, DailyBars, Delta, GradeBars, MonthSwitcher, SetBox, StatGrid, StatTile, TotalRow, TrendBars } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { PickedFile, VideoPickButton, VideoStrip, VideoViewer, type VideoCard } from "@/components/ui/Video";
import { Pin, TempPin, WallPhoto } from "@/components/ui/Wall";
import { fakeWall } from "@/lib/demo";
import { FEEL, GRADE_BANDS, GRADE_FEEL, GRADES, HOLD_COLOR_NAMES, type BandId, type HoldColor, type Status } from "@/lib/design";
import { MINGDE_PLAN } from "@/lib/floorplan";
import { LIVE_GYM } from "@/lib/gyms";

type DemoRoute = { code: string; grade: number; color: HoldColor; tags: string[]; x: number; y: number; status: Status | null; isNew: boolean; comments: number };

const ZONES = [
  { code: "A", name: "A 區", done: 9, total: 20, resetDays: 5, seed: 100 },
  { code: "W", name: "比賽牆", done: 2, total: 10, resetDays: 24, seed: 101 },
  { code: "B", name: "B 區", done: 11, total: 16, resetDays: 12, seed: 102 },
  { code: "C", name: "C 區", done: 13, total: 14, resetDays: 33, seed: 103 },
  { code: "D", name: "D 區", done: 0, total: 10, resetDays: 48, seed: 104 },
];
// 區域卡片的難度色帶示範（每條路線的難度，由易到難；10 = V10 還沒定膠帶顏色）
const ZONE_GRADES: Record<string, number[]> = {
  A: [-1, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 6, 6, 7, 8, 9, 10],
  W: [6, 6, 7, 7, 8, 8, 9, 9, 10, 10],
  B: [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7, 8],
};

const STATUSES: (Status | null)[] = ["flash", "send", null, "send", "project", null, "send", null, null, "flash"];
const TAGS = [["力量"], ["技巧", "平衡"], ["腳法"], ["動態"], ["指力"], [], ["協調", "柔軟"], ["耐力"], ["平衡"], ["技巧"]];

const DEMO_VIDEOS: VideoCard[] = [
  { key: "1", name: "小安", ago: "2 天前", status: "flash", caption: "第三手用左腳勾" },
  { key: "2", name: "阿明", ago: "昨天", status: "send", caption: "最後一手要果斷" },
  { key: "3", name: "我", ago: "今天", status: "project", meta: "B 區 B-03" },
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
  const [demoTab, setDemoTab] = useState<"log" | "video" | "comment">("log");
  const [rate, setRate] = useState<number | null>(3);
  const [trendPick, setTrendPick] = useState<number | null>(null);
  const [holdType, setHoldType] = useState<"s" | "h" | "t">("s");
  const [holdSize, setHoldSize] = useState<1 | 2 | 3>(2);
  const [order, setOrder] = useState(["A 區", "比賽牆", "B 區", "C 區"]);
  const [pickColor, setPickColor] = useState<HoldColor>("紅");
  const [pickPerson, setPickPerson] = useState<string | null>("a");
  const [pickGrade, setPickGrade] = useState(3);
  const [pickTags, setPickTags] = useState<string[]>(["技巧"]);
  const [toggle, setToggle] = useState(true);
  const [draft, setDraft] = useState("");
  const [month, setMonth] = useState(9);
  const [pickDay, setPickDay] = useState<number | null>(23);
  const [bandId, setBandId] = useState<BandId | null>("mid");
  const band = GRADE_BANDS.find((b) => b.id === bandId) ?? null;

  const match = (r: DemoRoute) => (grade == null || r.grade === grade) && (color == null || r.color === color);
  const grades = [...new Set(routes.map((r) => r.grade))].sort((a, b) => a - b);
  const colors = [...new Set(routes.map((r) => r.color))];
  const counts: Record<number, number> = { 2: 1, 5: 3, 9: 5, 12: 2, 16: 4, 19: 1, 23: 6, 26: 2, 29: 3 };

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
        <FloorPlan shape={MINGDE_PLAN} gymName={LIVE_GYM.name} zones={ZONES} onSelect={(c) => toast(`點了 ${c} 區`)} />
        <p className="mt-3 mb-1.5 text-meta text-muted">管理後台（admin）：顯示路線數，粗框是目前編輯的區域</p>
        <FloorPlan admin selected="B" shape={MINGDE_PLAN} gymName={LIVE_GYM.name} zones={ZONES} onSelect={(c) => toast(`切換到 ${c} 區`)} />
        <p className="mt-3 mb-1.5 text-meta text-muted">沒登入（guest）：每區寫路線數、統一底色</p>
        <FloorPlan guest shape={MINGDE_PLAN} gymName={LIVE_GYM.name} zones={ZONES} onSelect={(c) => toast(`點了 ${c} 區`)} />
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
              grades={ZONE_GRADES[z.code]}
              scale={20}
              band={band}
              fresh={i === 2}
              resetDays={z.resetDays}
            />
          ))}
          <ZoneCard photo={fakeWall(104).uri} name="D 區（沒登入）" done={0} grades={[0, 1, 2, 3, 4]} scale={20} band={band} guest resetDays={48} />
        </ZoneList>
        <p className="mt-2 mb-0 text-meta text-muted">選了難度：範圍內的色段保持粗、寫條數，其他縮成細線；整區沒有這個難度就變淡。NEW＝3 天內有新路線</p>
      </Block>

      <Block title="即將換線">
        <ResetList
          items={[
            { key: "A", name: "A 區", date: "10/05", left: 11, total: 20, days: 5 },
            { key: "B", name: "B 區", date: "10/12", left: 5, total: 16, days: 12 },
            { key: "W", name: "比賽牆（沒登入）", date: "10/24", left: null, total: 10, days: 24 },
          ]}
        />
      </Block>

      <Block title="最新路線">
        <NewRouteRow>
          {routes.slice(0, 5).map((r, i) => (
            <NewRouteCard key={r.code} color={r.color} grade={r.grade} zone="A 區" ago={i === 0 ? "今天" : `${i} 天前`} onClick={() => openRoute(r)} />
          ))}
        </NewRouteRow>
      </Block>

      <Block title="區域頁：照片、標記、篩選">
        <Toggle checked={setter} onChange={setSetter} label="管理模式（點照片新增）" />
        <WallPhoto src={wall.uri} alt="A 區照片" setter={setter} hideable={!setter} onPick={(x, y) => setTemp({ x, y })}>
          {routes.map((r) => (
            <Pin
              key={r.code}
              x={r.x}
              y={r.y}
              color={r.color}
              grade={r.grade}
              status={r.status === "project" ? null : r.status}
              dim={!match(r)}
              label={`V${r.grade} ${r.color}色 ${r.code}`}
              onClick={() => openRoute(r)}
            />
          ))}
          {temp && <TempPin x={temp.x} y={temp.y} />}
        </WallPhoto>
        <HowTo
          id="design"
          title="顏色和分數怎麼看"
          lines={["照片上的圓點：顏色是岩點的顏色，數字是難度", "難度標籤（例如 V3）的顏色是牆上膠帶的顏色", "Flash：第一次嘗試就完攀，分數 ×1.2"]}
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
        <RouteList>
          {routes.filter(match).map((r) => (
            <RouteRow
              key={r.code}
              color={r.color}
              grade={r.grade}
              title={`${r.color}色 ${r.code}`}
              isNew={r.isNew}
              status={r.status}
              meta={
                <>
                  <Tags tags={r.tags} /> 3 天前{r.comments > 0 && <CommentCount n={r.comments} />}
                </>
              }
              onClick={() => openRoute(r)}
            />
          ))}
        </RouteList>
      </Block>

      <Block title="路線卡片（底部彈出）">
        <Button variant="primary" onClick={() => openRoute(routes[1])}>
          打開路線卡片
        </Button>
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
        <CalendarHeat year={2026} month={month} counts={counts} today={month === 9 ? 30 : undefined} />
        <SectionTitle>本月難度分布</SectionTitle>
        <GradeBars
          rows={[
            { grade: 2, ratio: 0.5, label: "4 條" },
            { grade: 3, ratio: 1, label: "8 條" },
            { grade: 4, ratio: 0.75, label: "6 條" },
            { grade: 5, ratio: 0.5, label: "4 條" },
            { grade: 6, ratio: 0.125, label: "1 條" },
          ]}
        />
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
        <SectionTitle>目前牆上進度</SectionTitle>
        <GradeBars
          rows={[
            { grade: 0, ratio: 1, label: "6/6" },
            { grade: 3, ratio: 0.6, label: "9/15" },
            { grade: 6, ratio: 0.1, label: "1/10" },
          ]}
        />
      </Block>

      <Block title="路線卡片：點一下就記錄＋分頁">
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

      <Block title="使用狀況（後台）">
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

      <Block title="拖曳排序">
        <SortList items={order.map((n) => ({ id: n, label: n }))} onChange={setOrder} />
      </Block>

      <Block title="顧客影片">
        <VideoStrip items={DEMO_VIDEOS} onOpen={setPlaying} />
        <VideoViewer
          items={DEMO_VIDEOS}
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
