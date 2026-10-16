"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PageCheer } from "@/components/MascotCheer";
import ReportSheet, { type ReportTarget } from "@/components/ReportSheet";
import RouteSheet, { type RouteTab } from "@/components/RouteSheet";
import { Button } from "@/components/ui/Button";
import { BackLink, Empty, Tip } from "@/components/ui/Card";
import { Chip, ChipRow, GradeChip } from "@/components/ui/Chip";
import { HowTo } from "@/components/ui/HowTo";
import { ReportLink } from "@/components/ui/Report";
import { BandHeading, BandPicker, dueText, ZoneGradeCard } from "@/components/ui/Gym";
import { CommentCount, Points, RouteList, RouteRow, Tags, VideoCount } from "@/components/ui/Route";
import { useToast } from "@/components/ui/Toast";
import { NoPhoto, Pin, WallPhoto } from "@/components/ui/Wall";
import {
  getZoneView,
  photoUrl,
  reportsReady,
  takeZoneAhead,
  seqTotal,
  type Ascent,
  type Gym,
  type Route,
  type Zone,
  type ZoneData,
} from "@/lib/data";
import { zoneLines } from "@/lib/cheer";
import { ago, daysUntil, isNew } from "@/lib/date";
import { GRADE_BANDS, gradeColor, gradeLabel, inBand, isYds, type BandId, type HoldColor, STYLE_TAGS } from "@/lib/design";
import { backOr, herePath, upTo } from "@/lib/nav";
import { overlayPending, peekCache, withCache } from "@/lib/offline";
import { routePoints } from "@/lib/scoring";
import { useScoring } from "@/lib/useScoring";

// 區域頁換區時先知道的東西（館、區域名字）：路線還在讀的時候標題、返回、上一區／下一區照樣顯示
export type ZoneHead = { gymId: string; gymName: string; zoneName: string };

// 區域頁（版型固定，見 CLAUDE.md）：標題 → 上一區／下一區 → 照片＋起步點標記（可隱藏，只看岩牆）→ 難度色帶卡 → 難度四格 → 說明 →
// 顏色、風格篩選 → 路線依入門／進階／挑戰分段
// YDS、長耐力的區（沒有膠帶顏色）：難度篩選用一個一個難度的小按鈕、路線不分段
// 難度篩選由外面記（左右滑換區時保留：新的區有這個難度就照樣篩，沒有就顯示全部）：
// band 是四格（跟館首頁同一個，記在手機）、grade 是 YDS／長耐力的小按鈕；nav：標題下面的上一區／下一區
// onZone：讀到這一區的資料時告訴外面（換區用的館、名字、路線數）
// focus：New~「看路線 ›」跳過來要標出的路線：照片上那個點放大、黃圈閃三下、其他點變淡，接著打開路線卡片（停在紀錄）；
//   改篩選、點別條路線就恢復；已經下架（牆上沒有）就跳提示；back：返回改成別的（從 New~ 來寫「‹ New~」）
export default function ZoneView({
  zoneId,
  band: wantBand,
  onBand,
  grade: wantGrade,
  onGrade,
  head,
  nav,
  onZone,
  focus: focusRoute,
  back,
}: {
  zoneId: string;
  band: BandId | null;
  onBand: (b: BandId | null) => void;
  grade: number | null;
  onGrade: (g: number | null) => void;
  head?: ZoneHead | null;
  nav?: ReactNode;
  onZone?: (z: ZoneHead & { total: number }) => void;
  focus?: string | null;
  back?: { label: string; onClick: () => void } | null;
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
  const [videoCounts, setVideoCounts] = useState<Record<string, number>>(init?.vs ?? {});
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<HoldColor | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<Route | null>(null);
  const [openTab, setOpenTab] = useState<RouteTab | undefined>(undefined);
  const [focus, setFocus] = useState<string | null>(focusRoute ?? null);
  const focusDone = useRef(!focusRoute); // 標出來的路線已經打開過卡片（或確定牆上沒有）
  const [fresh, setFresh] = useState(false); // 讀到最新的了（不是手機裡上次的）：這時還找不到才算下架
  const focusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useToast();
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
      setVideoCounts(data.vs ?? {});
    };
    try {
      // 滑向這一區時已經先讀了：直接用那一份（只有第一次）
      const { data } = await withCache(`zone:${zoneId}:${uid ?? "guest"}`, () => takeZoneAhead(zoneId, uid) ?? getZoneView(zoneId), first.current ? apply : undefined);
      first.current = false;
      apply(data);
      setError(null);
      setFresh(true);
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

  // 標出 New~ 點進來的路線：一進來照片就在上面，先看到黃圈閃，一下子後再打開卡片
  // 手機裡上次的資料可能還有剛下架的那條：等讀到最新的再決定（沒網路、讀不到才用手機裡的）
  useEffect(() => {
    if (focusDone.current || !focus) return;
    if (!fresh && !error && navigator.onLine) return;
    const r = routes.find((x) => x.id === focus);
    focusDone.current = true;
    if (!r) {
      queueMicrotask(() => setFocus(null));
      // 讀到最新的才確定是下架；沒網路、讀不到就不亂說（區域頁本來就會寫讀不到）
      if (fresh) toast("這條路線已經下架了");
      return;
    }
    // 等的時候資料又更新（手機裡上次的 → 最新的）不能取消，所以計時器記在外面、離開這頁才清掉
    focusTimer.current = setTimeout(() => {
      setOpenTab("log");
      setOpen(r);
    }, 900);
  }, [routes, fresh, error, focus, toast]);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  // 路線回報（step47）：資料庫有這個功能才顯示最下面的入口
  const [canReport, setCanReport] = useState(false);
  const [report, setReport] = useState<ReportTarget>(null);
  useEffect(() => {
    let live = true;
    void reportsReady().then((ok) => live && setCanReport(ok));
    return () => {
      live = false;
    };
  }, []);
  // 改篩選、點別條路線：黃圈拿掉，照片恢復照篩選變淡
  // 還沒自動打開卡片前就自己點了別的：不再自動打開
  const unfocus = () => {
    clearTimeout(focusTimer.current);
    setFocus(null);
  };
  const openRoute = (r: Route) => {
    clearTimeout(focusTimer.current);
    if (r.id !== focus) setFocus(null);
    setOpenTab(undefined);
    setOpen(r);
  };

  // 讀到資料就告訴外面（換區用）；layout effect：上一區／下一區跟畫面同一次畫出來，不會晚一點才把照片往下推
  const total = routes.length;
  useLayoutEffect(() => {
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
        {back ? <BackLink onClick={back.onClick}>{back.label}</BackLink> : <BackLink onClick={() => upTo(router, `/gym/${head.gymId}`)}>{head.gymName}</BackLink>}
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
  // V 級的區用四格、路線分段；YDS、長耐力（或 V 級的區裡還留著 YDS 的路線）用小按鈕
  const banded = zone.grade_system === "v" && !routes.some((r) => isYds(r.grade));
  const missing = GRADE_BANDS.filter((b) => !routes.some((r) => inBand(r.grade, b))).map((b) => b.id);
  // 記著的難度這一區有才篩，沒有就顯示全部（記著的不變，換到有的區又會篩）
  const askedBand = banded ? (GRADE_BANDS.find((b) => b.id === wantBand) ?? null) : null;
  const band = askedBand && !missing.includes(askedBand.id) ? askedBand : null;
  const grade = !banded && wantGrade != null && grades.includes(wantGrade) ? wantGrade : null;
  const match = (r: Route) =>
    inBand(r.grade, band) && (grade == null || r.grade === grade) && (color == null || r.hold_color === color) && (tag == null || r.style_tags.includes(tag));
  const shown = routes.filter(match);
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

  const row = (r: Route) => (
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
          {(videoCounts[r.id] ?? 0) > 0 && <VideoCount n={videoCounts[r.id]} />}
          {commentsOn && r.comments_enabled && (counts[r.id] ?? 0) > 0 && <CommentCount n={counts[r.id]} />}
        </>
      }
      onClick={() => openRoute(r)}
    />
  );

  return (
    <>
      {/* 一定回這間館的首頁（登入回來時上一頁是同一區）；從 New~ 來的回 New~ */}
      {back ? <BackLink onClick={back.onClick}>{back.label}</BackLink> : <BackLink onClick={() => upTo(router, `/gym/${zone.gym_id}`)}>{gym.name}</BackLink>}
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
      {/* 原岩夥伴：講這一區（方框下面、照片上面；換區換一句） */}
      {session && (
        <PageCheer
          key={zone.id}
          uid={session.user.id}
          page={`zone:${zone.id}`}
          pool={zoneLines({
            zone: zone.name,
            total: routes.length,
            done,
            projects: routes.filter((r) => status(r) === "project"),
            fresh: routes.filter((r) => isNew(r.created_at) && status(r) !== "flash" && status(r) !== "send").length,
          })}
        />
      )}

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
                dim={focus ? r.id !== focus : !match(r)}
                focus={r.id === focus}
                label={seqTotal(r) ? `${gradeLabel(r.grade)} ${seqTotal(r)} 點 ${r.code}` : `${gradeLabel(r.grade)} ${r.hold_color}色 ${r.code}`}
                onClick={() => openRoute(r)}
              />
            );
          })}
        </WallPhoto>
      ) : (
        <NoPhoto>這區的照片還沒上傳</NoPhoto>
      )}

      {routes.length > 0 && (
        <>
          {banded && (
            <>
              <ZoneGradeCard name={zone.name} grades={routes.map((r) => r.grade)} band={band} />
              <div className="mt-3 mb-2">
                <BandPicker value={band?.id ?? null} onChange={(b) => (unfocus(), onBand(b))} missing={missing} />
              </div>
              <Tip>
                {band
                  ? `只列 ${band.range}，照片上其他難度的路線變淡。`
                  : askedBand
                    ? `這區沒有 ${askedBand.range} 的路線，先顯示全部。`
                    : "色帶是牆上的膠帶顏色，數字是這個難度有幾條。"}
              </Tip>
            </>
          )}
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
          {!banded && (
            <ChipRow>
              <Chip num pressed={grade == null} onClick={() => (unfocus(), onGrade(null))}>
                全部
              </Chip>
              {grades.map((g) => (
                <GradeChip key={g} grade={g} pressed={grade === g} onClick={() => (unfocus(), onGrade(g))} />
              ))}
            </ChipRow>
          )}
          {!endurance && (
            <ChipRow>
              <Chip pressed={color == null} onClick={() => (unfocus(), setColor(null))}>
                所有顏色
              </Chip>
              {colors.map((c) => (
                <Chip key={c} pressed={color === c} onClick={() => (unfocus(), setColor(c))}>
                  {c}
                </Chip>
              ))}
            </ChipRow>
          )}
          {tags.length > 0 && (
            <ChipRow>
              <Chip pressed={tag == null} onClick={() => (unfocus(), setTag(null))}>
                所有風格
              </Chip>
              {tags.map((t) => (
                <Chip key={t} pressed={tag === t} onClick={() => (unfocus(), setTag(t))}>
                  {t}
                </Chip>
              ))}
            </ChipRow>
          )}
        </>
      )}

      {!shown.length ? (
        <Empty>{routes.length ? "沒有符合的路線。" : "這區目前沒有路線。"}</Empty>
      ) : banded ? (
        // 依入門／進階／挑戰分段（選了一段就只有那一段）
        GRADE_BANDS.map((b) => {
          const rs = shown.filter((r) => inBand(r.grade, b));
          return (
            rs.length > 0 && (
              <section key={b.id}>
                <BandHeading band={b} count={rs.length} />
                <RouteList>{rs.map(row)}</RouteList>
              </section>
            )
          );
        })
      ) : (
        <RouteList>{shown.map(row)}</RouteList>
      )}

      {/* 路線回報：只加在最下面（版型固定，見 CLAUDE.md）；岩牆有照片、開放的館才有 */}
      {canReport && src && gym.is_live && zone.kind !== "spray" && (
        <ReportLink onClick={() => (session ? setReport({ kind: "missing", zone, photo: src, routes }) : router.push(`/login?next=${encodeURIComponent(herePath())}`))}>
          找不到你爬的路線？回報給定線員
        </ReportLink>
      )}
      <ReportSheet target={report} onClose={() => setReport(null)} />

      <RouteSheet
        route={open}
        photo={src}
        zonePhoto={src ? { src } : null}
        zoneName={zone.name}
        gymId={zone.gym_id}
        gymCommentsOn={commentsOn}
        ascent={open ? (ascents[open.id] ?? null) : null}
        initialTab={openTab}
        onClose={() => {
          setOpen(null);
          void load();
        }}
        onSaved={(a) => open && setAscents((m) => (a ? { ...m, [open.id]: a } : Object.fromEntries(Object.entries(m).filter(([k]) => k !== open.id))))}
      />
    </>
  );
}
