"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import LogDayView from "@/components/me/LogDay";
import { Button } from "@/components/ui/Button";
import { Empty, Tip } from "@/components/ui/Card";
import { MilestoneRow } from "@/components/ui/Training";
import { getClimbDays, getMilestones, getTrainingDays, type ClimbDayRow, type Milestone, type TrainingDay } from "@/lib/data";
import { md, todayYmd } from "@/lib/date";
import { gradeLabel } from "@/lib/design";
import { withCache } from "@/lib/offline";
import { groupDays, LOG_PAGE_DAYS } from "@/lib/training";

const PAGE_ROWS = 200;
// 讀一頁：before 之前最近的紀錄；最後一天可能被 200 筆切到一半，切到的那天留到下一頁
async function loadPage(uid: string, before?: string): Promise<{ climbs: ClimbDayRow[]; diaries: Record<string, TrainingDay>; next: string | null }> {
  const rows = await getClimbDays(uid, { before, limit: PAGE_ROWS });
  let days = [...new Set(rows.map((r) => r.day))];
  let next: string | null = null;
  if (rows.length >= PAGE_ROWS && days.length > 1) days = days.slice(0, -1);
  if (days.length > LOG_PAGE_DAYS) days = days.slice(0, LOG_PAGE_DAYS);
  if (rows.length >= PAGE_ROWS || days.length >= LOG_PAGE_DAYS) next = days[days.length - 1] ?? null;
  const keep = new Set(days);
  const climbs = rows.filter((r) => keep.has(r.day));
  // 這段時間的日誌（沒記路線、只寫了日誌的那天也算）
  const to = before ? prevDay(before) : todayYmd();
  const from = next ?? "2020-01-01";
  const diaries = await getTrainingDays(uid, from, to);
  return { climbs, diaries, next };
}
const prevDay = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

// 日誌：時間軸，每次去館一張卡（路線自動帶入、感覺、一句話），中間穿插里程碑（第一次完攀、新的最高難度）
export default function LogTab({
  uid,
  cardPublic,
  version,
  onRoute,
  onDiary,
}: {
  uid: string;
  cardPublic: boolean | null;
  version: number;
  onRoute: (routeId: string) => void;
  onDiary?: (t: TrainingDay) => void;
}) {
  const [climbs, setClimbs] = useState<ClimbDayRow[] | null>(null);
  const [diaries, setDiaries] = useState<Record<string, TrainingDay>>({});
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    type Data = Awaited<ReturnType<typeof loadPage>> & { m: Milestone[] };
    const apply = (x: Data) => {
      setClimbs(x.climbs);
      setDiaries(x.diaries);
      setNext(x.next);
      setMilestones(x.m);
    };
    try {
      const { data } = await withCache<Data>(
        `log:${uid}`,
        async () => {
          const [p, m] = await Promise.all([loadPage(uid), getMilestones()]);
          return { ...p, m };
        },
        apply
      );
      apply(data);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [uid]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load, version]);

  const more = async () => {
    if (!next) return;
    setBusy(true);
    try {
      const p = await loadPage(uid, next);
      setClimbs((c) => [...(c ?? []), ...p.climbs]);
      setDiaries((d) => ({ ...p.diaries, ...d }));
      setNext(p.next);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  if (!climbs) return <Empty>{err ?? "讀取中…"}</Empty>;
  const days = groupDays(climbs, diaries, milestones);
  if (!days.length)
    return <Empty>還沒有紀錄。在路線卡片記 Flash、完攀或嘗試中，每次去館的路線會自動排在這裡，也可以寫一句話。</Empty>;
  return (
    <>
      <Tip>每次去館一張卡，記的路線自動帶入；點「＋ 寫日誌」記感覺和一句話。</Tip>
      <ol aria-label="日誌" className="m-0 grid list-none gap-3 p-0">
        {days.map((d) => (
          <Fragment key={d.day}>
            {d.milestones.map((m) => (
              <li key={`${m.day}-${m.grade}`}>
                <MilestoneRow>
                  🏅 <b>{m.first ? `第一次完攀${m.grade >= 100 ? "上攀" : ""}！` : `新的最高難度 ${gradeLabel(m.grade)}！`}</b>
                  <span className="ml-1 text-meta text-muted">
                    {md(m.day)}
                    {m.first ? `・${gradeLabel(m.grade)}` : ""}
                  </span>
                </MilestoneRow>
              </li>
            ))}
            <li>
              <LogDayView d={d} all={climbs} userId={uid} editable cardPublic={cardPublic} onRoute={(c) => onRoute(c.route.id)} onDiary={(t) => (setDiaries((x) => ({ ...x, [t.day]: t })), onDiary?.(t))} />
            </li>
          </Fragment>
        ))}
      </ol>
      {next && (
        <div className="mt-3">
          <Button disabled={busy} onClick={() => void more()}>
            {busy ? "讀取中…" : "再看更早的"}
          </Button>
        </div>
      )}
    </>
  );
}
