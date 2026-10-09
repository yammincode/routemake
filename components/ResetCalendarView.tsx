"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { BackLink, Empty, PageTitle, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { GymDot, ResetDateRow, ResetMonth } from "@/components/ui/Resets";
import { MonthSwitcher } from "@/components/ui/Stats";
import { getResetCalendar } from "@/lib/data";
import { todayYmd } from "@/lib/date";
import { GYMS, gymPath, saveLastGym } from "@/lib/gyms";
import { backOr } from "@/lib/nav";
import { withCache } from "@/lib/offline";
import { addDays, dayDiff, newRoutesText, resetPhase, type ResetEvent } from "@/lib/resets";

const LIVE = GYMS.filter((g) => g.live);
const gymName = (id: string) => GYMS.find((g) => g.id === id)?.name ?? "";
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

// 換線行事曆：各館換線日畫在月曆上（每間館一個顏色），可以只看一間館；點日期看那天的細節
export default function ResetCalendarView() {
  const router = useRouter();
  // 今天（台北）在手機上才決定：這頁是事先產生好的，不能用產生當天的日期
  const [today, setToday] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [gym, setGym] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() => {
      const t = todayYmd();
      setToday(t);
      setMonth(t.slice(0, 7));
      setDay(t);
    });
  }, []);
  const [events, setEvents] = useState<ResetEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 前後各多抓一週（月曆頭尾會露出上下個月的日子）；手機裡有上次的先顯示，沒網路也看得到
  const load = useCallback(async () => {
    if (!month) return;
    const from = addDays(`${month}-01`, -7);
    const to = addDays(`${month}-01`, 45);
    try {
      const { data } = await withCache(`resets:${month}`, () => getResetCalendar(from, to), setEvents);
      setEvents(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (!month || !today) return <PageTitle sub="讀取中…">換線行事曆</PageTitle>;
  const [y, m] = month.split("-").map(Number);
  const shown = (events ?? []).filter((e) => !gym || e.gym_id === gym);
  const onDay = day ? shown.filter((e) => e.starts_on <= day && e.ends_on >= day) : [];

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <BackLink onClick={() => backOr(router, "/gyms")}>返回</BackLink>
        <Logo />
      </div>
      <PageTitle sub="第一天拆線、第二天定線，定線當天晚上起新路線">換線行事曆</PageTitle>
      <ChipRow>
        <Chip pressed={gym == null} onClick={() => setGym(null)}>
          全部
        </Chip>
        {LIVE.map((g) => (
          <Chip key={g.id} pressed={gym === g.id} onClick={() => setGym(gym === g.id ? null : g.id)}>
            <span className="inline-flex items-center gap-1.5">
              <GymDot gymId={g.id} />
              {g.name.replace(/館$/, "")}
            </span>
          </Chip>
        ))}
      </ChipRow>
      <MonthSwitcher year={y} month={m} onPrev={() => (setMonth(shiftMonth(month, -1)), setDay(null))} onNext={() => (setMonth(shiftMonth(month, 1)), setDay(null))} />
      {error && !events ? (
        <Empty>{error}</Empty>
      ) : (
        <ResetMonth month={month} events={shown} gymName={gymName} today={today} selected={day} onSelect={setDay} />
      )}

      {day && (
        <>
          <SectionTitle>
            {+day.slice(5, 7)} 月 {+day.slice(8, 10)} 日
            {day === today && <small className="ml-2 text-meta font-normal text-muted">今天</small>}
          </SectionTitle>
          {events == null ? (
            <Empty>讀取中…</Empty>
          ) : onDay.length === 0 ? (
            <Empty>這天沒有換線{gym ? `（只看${gymName(gym)}）` : ""}。</Empty>
          ) : (
            <div className="grid gap-px overflow-hidden rounded-tile bg-line shadow-card">
              {onDay.map((e) => {
                const p = resetPhase(e, today);
                return (
                  <button
                    key={e.id}
                    className="block w-full min-w-0 text-left"
                    onClick={() => {
                      saveLastGym(e.gym_id);
                      router.push(gymPath(e.gym_id));
                    }}
                  >
                    <ResetDateRow
                      e={e}
                      dim={p.phase === "done" || p.phase === "fresh"}
                      title={
                        <span className="inline-flex items-center gap-1.5">
                          <GymDot gymId={e.gym_id} />
                          {gymName(e.gym_id)} {e.label}
                        </span>
                      }
                      sub={day === e.ends_on ? "定線日，當天晚上起新路線" : day === e.starts_on ? `拆線日，${newRoutesText(e)}` : newRoutesText(e)}
                      aside={
                        <span className={`flex-none text-meta ${p.phase === "upcoming" && p.days <= 7 ? "font-bold text-warn" : "text-muted"}`}>
                          {p.phase === "upcoming" ? `${p.days} 天後` : p.phase === "ongoing" ? "換線中" : `${dayDiff(e.ends_on, today)} 天前換好`}
                        </span>
                      }
                    />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <Tip>換線日以各館現場公告為準。點換線的那一列可以直接進那間館。</Tip>
    </>
  );
}
