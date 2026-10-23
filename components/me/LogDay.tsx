"use client";

import { useState } from "react";
import DiaryEditor from "@/components/me/DiaryEditor";
import { FeelDots, LogDayCard, LogRoute } from "@/components/ui/Training";
import { TRAINING_HOURS, TRAINING_KINDS, seqTotal, type ClimbDayRow, type TrainingDay } from "@/lib/data";
import { md, todayYmd } from "@/lib/date";
import { dayGyms, routeHistory, type LogDay } from "@/lib/training";

const SHOW = 4; // 一天先列幾條，其他按「再看 ○ 條」
const week = (day: string) => "日一二三四五六"[new Date(`${day}T00:00:00Z`).getUTCDay()]; // 日期字串本身就是台北的那天，不看手機時區
export const dayTitle = (day: string) => `${day === todayYmd() ? "今天 " : ""}${+day.slice(5, 7)}/${+day.slice(8, 10)}（${week(day)}）`;

const routeName = (c: ClimbDayRow) => {
  const r = c.route;
  if (r.name) return `${r.zone_name}・${r.name}`;
  if (seqTotal(r)) return `${r.zone_name} ${r.code}`;
  return `${r.zone_name} ${r.hold_color}色`;
};
// 這條路線到這天為止試了幾天：「10/18 試 6 次 → 今天 2 次」；只有一天就寫「試 3 次」「第一次就上」
function routeNote(c: ClimbDayRow, all: ClimbDayRow[]): string | undefined {
  const h = routeHistory(all, c.route.id, c.day);
  const n = seqTotal(c.route);
  const hp = n && c.status === "project" && c.highpoint ? `爬到第 ${c.highpoint}／${n} 點` : "";
  const tries = (t: number | null) => (t ? `試 ${t} 次` : "");
  if (h.length > 1) {
    const path = h.map((x) => `${x.day === c.day ? (c.day === todayYmd() ? "今天" : md(x.day)) : md(x.day)}${x.tries ? ` ${x.tries} 次` : ""}`).join(" → ");
    return [`第 ${h.length} 天`, path, hp].filter(Boolean).join("・");
  }
  if (c.status === "flash") return hp || "第一次就上";
  return [tries(c.tries), hp].filter(Boolean).join("・") || undefined;
}

// 日誌分頁、攀爬日點一天、這週的今天：那天的路線（自動帶入）＋日誌（editable 時可以寫、改）
export default function LogDayView({
  d,
  all,
  userId,
  editable,
  cardPublic,
  onRoute,
  onDiary,
}: {
  d: LogDay;
  all: ClimbDayRow[];
  userId?: string;
  editable: boolean;
  cardPublic: boolean | null;
  onRoute?: (c: ClimbDayRow) => void;
  onDiary?: (t: TrainingDay) => void;
}) {
  const [more, setMore] = useState(false);
  const [edit, setEdit] = useState(false);
  const sends = d.climbs.filter((c) => c.status !== "project");
  const flashes = sends.filter((c) => c.status === "flash").length;
  const shown = more ? d.climbs : d.climbs.slice(0, SHOW);
  const t = d.diary;
  const kinds = t ? TRAINING_KINDS.filter((k) => t.kinds.includes(k.v)).map((k) => k.t) : [];
  const hours = t?.hours ? TRAINING_HOURS.find((h) => h.v === t.hours)?.t : null;
  return (
    <LogDayCard
      title={dayTitle(d.day)}
      gyms={dayGyms(d)}
      feel={t?.feel ?? null}
      footer={
        <>
          {d.climbs.length > 0 && (
            <span>
              完攀 <b className="font-num text-ink">{sends.length}</b>
              {flashes > 0 && (
                <>
                  ・Flash <b className="font-num text-ink">{flashes}</b>
                </>
              )}
              {d.climbs.length > sends.length && `・嘗試中 ${d.climbs.length - sends.length}`}
            </span>
          )}
          {t?.is_public && editable && <span>🌐 公開到人物卡</span>}
          {editable && userId && !edit && (
            <button onClick={() => setEdit(true)} className="ml-auto py-1 font-bold text-accent">
              {t ? "編輯日誌" : "＋ 寫日誌"}
            </button>
          )}
        </>
      }
    >
      {d.climbs.length > 0 && (
        <ul className="m-0 mt-1 grid list-none divide-y divide-line p-0">
          {shown.map((c) => (
            <LogRoute key={c.route.id} grade={c.route.grade} color={seqTotal(c.route) ? null : c.route.hold_color} title={routeName(c)} note={routeNote(c, all)} status={c.status} onClick={onRoute ? () => onRoute(c) : undefined} />
          ))}
        </ul>
      )}
      {d.climbs.length > SHOW && (
        <button onClick={() => setMore(!more)} className="py-1 text-meta font-bold text-accent" aria-expanded={more}>
          {more ? "收起 ⌃" : `再看 ${d.climbs.length - SHOW} 條 ⌄`}
        </button>
      )}
      {t && !edit && (t.note || kinds.length || hours) && (
        <div className="mt-1.5 rounded-cell bg-sunk px-2.5 py-1.5 text-note">
          {(kinds.length > 0 || hours) && <span className="block text-meta text-muted">{[hours, ...kinds].filter(Boolean).join("・")}</span>}
          {t.note && <span className="block break-words">{t.note}</span>}
        </div>
      )}
      {t && !edit && !t.note && !kinds.length && !hours && t.feel && (
        <p className="mt-1 mb-0 text-meta text-muted">
          感覺 <FeelDots value={t.feel} />
        </p>
      )}
      {edit && userId && (
        <DiaryEditor
          userId={userId}
          day={d.day}
          value={t}
          cardPublic={cardPublic}
          onCancel={() => setEdit(false)}
          onSaved={(x) => {
            setEdit(false);
            onDiary?.(x);
          }}
        />
      )}
    </LogDayCard>
  );
}
