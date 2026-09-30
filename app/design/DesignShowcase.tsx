"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Header from "@/components/Header";
import { Button, LinkButton } from "@/components/ui/Button";
import { BackLink, Empty, PageTitle, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { ClosedNotice, CommentForm, CommentItem, CommentList, PrivateHint } from "@/components/ui/Comments";
import FloorPlan from "@/components/ui/FloorPlan";
import { ColorPicker, GradePicker, Label, Segmented, TagPicker, TextArea, TextField, Toggle } from "@/components/ui/Form";
import { NewRouteCard, NewRouteRow, ResetList, SoonBox, ZoneCard, ZoneList } from "@/components/ui/Gym";
import { CommentCount, Grade, HoldDot, Points, RouteList, RouteRow, SetterNote, StatusBadge, StatusPicker, Tags, Tape } from "@/components/ui/Route";
import Sheet, { SheetSection, SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { CalendarHeat, DailyBars, Delta, GradeBars, MonthSwitcher, SetBox, StatGrid, StatTile, TotalRow } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { Pin, TempPin, WallPhoto } from "@/components/ui/Wall";
import { fakeWall } from "@/lib/demo";
import { FEEL, GRADE_FEEL, HOLD_COLOR_NAMES, type HoldColor, type Status } from "@/lib/design";
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

const STATUSES: (Status | null)[] = ["flash", "send", null, "send", "project", null, "send", null, null, "flash"];
const TAGS = [["力量"], ["技巧", "平衡"], ["腳法"], ["動態"], ["指力"], [], ["協調", "柔軟"], ["耐力"], ["平衡"], ["技巧"]];

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
  const [pickColor, setPickColor] = useState<HoldColor>("紅");
  const [pickGrade, setPickGrade] = useState(3);
  const [pickTags, setPickTags] = useState<string[]>(["技巧"]);
  const [toggle, setToggle] = useState(true);
  const [draft, setDraft] = useState("");
  const [month, setMonth] = useState(9);
  const [pickDay, setPickDay] = useState<number | null>(23);

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
        <div className="mt-3 grid grid-cols-9 gap-1.5">
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
        <ZoneList>
          {ZONES.slice(0, 3).map((z) => (
            <ZoneCard key={z.code} photo={fakeWall(z.seed).uri} name={z.name} done={z.done} total={z.total} resetDays={z.resetDays} />
          ))}
        </ZoneList>
      </Block>

      <Block title="即將換線">
        <ResetList
          items={[
            { key: "A", name: "A 區", date: "10/05", left: 11, days: 5 },
            { key: "B", name: "B 區", date: "10/12", left: 5, days: 12 },
            { key: "W", name: "比賽牆", date: "10/24", left: 8, days: 24 },
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
        <WallPhoto src={wall.uri} alt="A 區照片" setter={setter} onPick={(x, y) => setTemp({ x, y })}>
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
        <ChipRow>
          <Chip num pressed={grade == null} onClick={() => setGrade(null)}>
            全部
          </Chip>
          {grades.map((g) => (
            <Chip key={g} num pressed={grade === g} onClick={() => setGrade(g)}>
              V{g}
            </Chip>
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

      <Block title="其他">
        <Empty>這個月還沒有完攀紀錄。</Empty>
        <div className="mt-3">
          <SoonBox name="第二館" backLabel="看明德館" onBack={() => toast("回明德館")} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Tape color="藍" />
          <Grade grade={4} />
          <span className="text-meta text-muted">色條＋難度</span>
        </div>
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
            <SheetSection title="留言" aside="2 則">
              <CommentList>
                <CommentItem name="小安" ago="2 天前" body="第三手好遠，矮個子加油" />
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
