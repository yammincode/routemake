"use client";

import { useEffect, useState } from "react";
import RouteInsightsView from "@/components/admin/RouteInsights";
import { PeopleInsights, SocialInsights } from "@/components/admin/UsageInsights";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { BackLink, Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { HighlightCard } from "@/components/ui/Insights";
import { Grade } from "@/components/ui/Route";
import { Tabs } from "@/components/ui/Tabs";
import { SetBox, StatGrid, StatTile, TrendBars } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import {
  NO_INSIGHTS,
  getRouteInsights,
  getUsage,
  getUsageInsights,
  resetUsageSince,
  type RouteInsights,
  type UsageInsights,
  type UsageStats,
} from "@/lib/data";
import { GYMS } from "@/lib/gyms";
import { clearInsightsBack, peekInsightsBack, pickHighlights, type Highlight, type InsightsBack } from "@/lib/insights";

type Tab = Highlight["tab"];
const TABS = [
  { key: "people", label: "人" },
  { key: "routes", label: "路線" },
  { key: "social", label: "互動" },
] as const;
const TAB_KEY = "routemake:usage-tab";
const savedTab = (): Tab => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return v === "routes" || v === "social" ? v : "people";
  } catch {
    return "people";
  }
};

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

// 使用狀況頁（營運分頁）：老闆授權的人只看老闆指定的館；老闆可以看全部館、各館比較，並設定「統計起始日」
// 上面「本週重點」（自動挑變化最大的 3 件，點了跳到那一段），下面分頁 人｜路線｜互動（記在手機）；路線一次看一間館
// 還沒套用 step45：人分頁照舊（活躍、每天、註冊、各館比較），熱門路線放在路線分頁，其他分析寫要套用 step45
// 「有使用」＝當天有打開 App，或有記錄攀爬、留言、分享影片（只算登入的人）
export default function UsageView() {
  const { access } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const owner = !!access?.is_owner;
  const myGyms = owner ? GYMS.filter((g) => g.live) : GYMS.filter((g) => g.live && access?.usage_gyms?.includes(g.id));
  // 點選的館（老闆：null＝全部館）；非老闆每次都對照目前的權限：
  // 剛打開時用的是手機裡上次的權限，新的權限讀回來、或老闆改了授權，就改看還能看的第一間
  const [picked, setPicked] = useState<string | null>(null);
  const scope = owner ? picked : picked && myGyms.some((g) => g.id === picked) ? picked : (myGyms[0]?.id ?? null);
  const [data, setData] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reload, setReload] = useState(0);
  const [tab, setTabState] = useState<Tab>("people");
  // insights／routes：undefined＝讀取中、null＝資料庫還沒套用 step45
  const [insights, setInsights] = useState<UsageInsights | null | undefined>(undefined);
  const [routes, setRoutes] = useState<RouteInsights | null | undefined>(undefined);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [jumpTo, setJumpTo] = useState<string | null>(null);

  // 點了本週重點：換好分頁、畫出那一段之後再捲過去
  useEffect(() => {
    if (!jumpTo) return;
    const el = document.getElementById(jumpTo);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    void Promise.resolve().then(() => setJumpTo(null));
  });

  // 從「路線」分頁點路線去區域頁、「‹ 使用狀況」回來：同一間館、路線分頁、捲回原本的位置
  const [back, setBack] = useState<InsightsBack | null>(null);
  useEffect(() => {
    const b = peekInsightsBack("usage");
    clearInsightsBack(); // 讀一次就丟（館不能看了、讀不到也不會留著）
    void Promise.resolve().then(() => {
      setTabState(b ? "routes" : savedTab());
      if (b) {
        setBack(b);
        setPicked(b.gym);
      }
    });
  }, []);
  useEffect(() => {
    if (!back || !routes || scope !== back.gym) return;
    window.scrollTo({ top: back.y });
    void Promise.resolve().then(() => setBack(null));
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* 存不了就只記這一次 */
    }
  };

  const allowed = owner || myGyms.length > 0;
  useEffect(() => {
    if (!allowed) return; // 沒授權：不用問資料庫（資料庫也會擋）
    let alive = true;
    void Promise.resolve().then(() => {
      setData(null);
      setPick(null);
      setInsights(undefined);
      setRoutes(undefined);
      setMoreError(null);
      setRouteError(null);
      setError(null);
      // 人和互動、路線分開讀：一邊出錯不會蓋掉另一邊
      const more = getUsageInsights(scope)
        .then((u) => alive && setInsights(u))
        .catch((e) => alive && setMoreError((e as Error).message));
      const rt = (scope ? getRouteInsights(scope) : Promise.resolve(null))
        .then((r) => alive && setRoutes(r))
        .catch((e) => alive && (setRoutes(null), setRouteError((e as Error).message)));
      const base = getUsage(scope)
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError((e as Error).message));
      return Promise.all([more, rt, base]);
    });
    return () => {
      alive = false;
    };
  }, [allowed, scope, reload]);

  if (!allowed)
    return (
      <Empty>
        使用狀況要老闆授權才看得到。需要的話請找老闆在「營運」授權給你的帳號（<b className="text-ink">{access?.username}</b>）。
      </Empty>
    );

  const all = scope == null;
  const highlights = insights || routes ? pickHighlights(insights ?? null, routes ?? null) : [];
  const jump = (h: Highlight) => {
    setTab(h.tab);
    setJumpTo(h.section);
  };
  const missing = insights === null; // 還沒套用 step45
  const loadingMore = insights === undefined && !moreError;
  const moreNote = moreError ? <Empty>{moreError}</Empty> : missing ? <Empty>{NO_INSIGHTS}</Empty> : loadingMore ? <Empty>讀取中…</Empty> : null;
  const rate = data && data.registered ? Math.round((data.month / data.registered) * 1000) / 10 : 0;

  const reset = async () => {
    if (!confirm) return setConfirm(true);
    try {
      const d = await resetUsageSince();
      toast(`已從 ${md(d)} 重新開始統計`);
      setConfirm(false);
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <BackLink onClick={() => router.push("/ops")}>營運</BackLink>
      {(owner || myGyms.length > 1) && (
        <ChipRow>
          {owner && (
            <Chip pressed={all} onClick={() => setPicked(null)}>
              全部館
            </Chip>
          )}
          {myGyms.map((g) => (
            <Chip key={g.id} pressed={scope === g.id} onClick={() => setPicked(g.id)}>
              {g.name}
            </Chip>
          ))}
        </ChipRow>
      )}
      {data?.since && (
        <p className="mt-0 mb-2 text-meta text-muted">
          從 <b className="text-ink">{md(data.since)}</b> 開始統計，之前的資料不算進來
        </p>
      )}

      {error ? (
        <Empty>{error}</Empty>
      ) : !data ? (
        <Empty>讀取中…</Empty>
      ) : (
        <>
          {!missing && !moreError && (
            <section>
              <SectionTitle className="mt-[18px]">本週重點</SectionTitle>
              {highlights.length ? (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {highlights.map((h) => (
                    <li key={h.key}>
                      <HighlightCard big={h.big} title={h.title} detail={h.detail} onClick={() => jump(h)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{loadingMore ? "讀取中…" : "資料還不夠，過幾天再來看。"}</Empty>
              )}
              {all && <Tip>路線的重點要選一間館才看得到。</Tip>}
            </section>
          )}

          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === "people" && (
            <>
              <SectionTitle>活躍人數</SectionTitle>
              <StatGrid>
                <StatTile value={data.today} label="今天" />
                <StatTile value={data.week} label="最近 7 天" />
                <StatTile value={data.month} label="最近 30 天" />
                {all ? <StatTile value={`${rate}%`} label="使用率" /> : <StatTile value={data.sends30} label="30 天完攀" />}
              </StatGrid>
              <Tip>
                活躍＝當天有打開 App，或有記錄攀爬、留言、分享影片的人（只算登入的人）。
                {all ? `使用率＝30 天活躍 ÷ 全部註冊 ${data.registered} 人。` : ""}
              </Tip>

              <SectionTitle>每天使用人數（最近 30 天）</SectionTitle>
              <SetBox>
                <TrendBars
                  label="最近 30 天每天使用人數"
                  items={data.daily.map((d) => ({
                    key: d.day,
                    tick: md(d.day),
                    title: `${md(d.day)}：${d.users} 人使用・完攀 ${d.sends} 條`,
                    value: d.users,
                  }))}
                  selected={pick}
                  onSelect={setPick}
                />
              </SetBox>

              <SectionTitle>註冊</SectionTitle>
              <StatGrid>
                <StatTile value={data.since ? data.registered_since : data.registered} label={data.since ? "上線後註冊" : "全部註冊"} />
                <StatTile value={data.new7} label="最近 7 天新註冊" />
                {data.since && <StatTile value={data.registered_before} label="測試期間註冊" />}
              </StatGrid>

              {data.gyms && (
                <>
                  <SectionTitle>各館比較（最近 30 天）</SectionTitle>
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {data.gyms.map((g) => {
                      const max = Math.max(1, ...data.gyms!.map((x) => x.users));
                      return (
                        <li key={g.gym} className="grid grid-cols-[64px_1fr_auto] items-center gap-2.5 text-note">
                          <b>{g.name}</b>
                          <span className="h-2.5 overflow-hidden rounded-full bg-sunk">
                            <span className="block h-full rounded-full bg-accent" style={{ width: `${(g.users / max) * 100}%` }} />
                          </span>
                          <span className="text-muted">
                            <b className="font-num text-ink">{g.users}</b> 人・完攀 <span className="font-num">{g.sends}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {insights && <PeopleInsights u={insights} />}
              {!insights && moreNote}
            </>
          )}

          {tab === "routes" &&
            (!all && routes ? (
              <RouteInsightsView data={routes} gym={scope!} from="usage" initialAll={back?.gym === scope ? back.all : false} />
            ) : (
              <>
                {all ? (
                  <Empty>完攀率、冷門路線、各區熱度、換線效果、難度供需一次看一間館，請在上面選館。</Empty>
                ) : routeError ? (
                  <Empty>{routeError}</Empty>
                ) : routes === undefined ? (
                  <Empty>讀取中…</Empty>
                ) : (
                  <Empty>{NO_INSIGHTS}</Empty>
                )}
                <SectionTitle>熱門路線（最近 30 天最多人完攀）</SectionTitle>
                {data.top_routes.length ? (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {data.top_routes.map((r, i) => (
                      <li key={r.id} className="flex items-center gap-3 rounded-btn bg-surface px-3 py-2 shadow-card">
                        <span className="w-4 font-num text-muted">{i + 1}</span>
                        <Grade grade={r.grade} className="text-num-bar w-[52px]" />
                        <span className="min-w-0 flex-1 truncate text-note">
                          {r.zone} {r.name ?? `${r.code} ${r.color}色`}
                        </span>
                        <span className="flex-none text-meta text-muted">
                          <b className="font-num text-ink">{r.n}</b> 人完攀
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>最近 30 天還沒有完攀紀錄。</Empty>
                )}
              </>
            ))}

          {tab === "social" && (insights ? <SocialInsights u={insights} /> : moreNote)}
        </>
      )}

      {owner && (
        <>
          <SectionTitle>統計起始日</SectionTitle>
          <SetBox>
            <p className="mt-3 mb-2 text-sub">
              {data?.since ? (
                <>
                  目前從 <b>{md(data.since)}</b> 開始統計
                </>
              ) : (
                "目前算全部資料（還沒設定起始日）"
              )}
            </p>
            <p className="mt-0 mb-3 text-meta text-muted">正式上線那天按一次，測試期間的資料就不會算進來。資料不會刪除，之後也可以再重新開始。</p>
            <Button variant={confirm ? "danger" : "default"} onClick={() => void reset()}>
              {confirm ? "再按一次確認：從今天重新開始統計" : "從今天重新開始統計"}
            </Button>
          </SetBox>
        </>
      )}
    </>
  );
}
