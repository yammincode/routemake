"use client";

import { useState } from "react";
import { LinkButton } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { InsightPill, InsightRouteRow, MeterList, MeterRow } from "@/components/ui/Insights";
import { type RouteInsights } from "@/lib/data";
import { COLD_DAYS, COLD_MAX, MIN_TRIED, SUPPLY_LABEL, coldRoutes, flagRoutes, pct, supplyShares, type FlaggedRoute } from "@/lib/insights";

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const routeTitle = (r: { zone: string; code: string; color: string; name: string | null }) => `${r.zone} ${r.name ?? `${r.color}色 ${r.code}`}`;

function Pills({ r }: { r: FlaggedRoute }) {
  return (
    <>
      {r.flag === "hard" && <InsightPill tone="hard">可能太難</InsightPill>}
      {r.flag === "easy" && <InsightPill tone="easy">可能太簡單</InsightPill>}
      {r.feel && <InsightPill tone="plain">{r.feel === "hard" ? "多人說偏硬" : "多人說偏軟"}</InsightPill>}
    </>
  );
}

// 「路線」分頁（使用狀況和管理後台「路線分析」共用）：完攀率、冷門、各區熱度、換線前後、難度供需、熱門路線
export default function RouteInsightsView({ data }: { data: RouteInsights }) {
  const [all, setAll] = useState(false);
  const routes = flagRoutes(data.routes);
  const marked = routes.filter((r) => r.flag || r.feel).sort((a, b) => b.tried - a.tried);
  const shown = all ? [...routes].sort((a, b) => b.tried - a.tried || a.code.localeCompare(b.code)) : marked;
  const cold = coldRoutes(data.routes);
  const zones = data.zones.filter((z) => z.routes || z.records).sort((a, b) => b.records - a.records);
  const zmax = Math.max(1, ...zones.map((z) => z.records));
  const supply = supplyShares(data.supply);

  return (
    <>
      <section id="rates">
        <SectionTitle>路線完攀率（牆上的路線）</SectionTitle>
        <Tip>
          跟同一段難度的平均比：完攀率低很多標「可能太難」，Flash 六成以上標「可能太簡單」（{MIN_TRIED} 人以上試過才判斷）；多人回報偏硬、偏軟也會標出來。
        </Tip>
        {shown.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {shown.map((r) => (
              <InsightRouteRow
                key={r.id}
                grade={r.grade}
                title={routeTitle(r)}
                meta={
                  <>
                    <b className="font-num text-ink">{r.tried}</b> 人試、<b className="font-num text-ink">{r.sent}</b> 人完攀・完攀率 {pct(r.sent, r.tried)}%
                    {r.flash > 0 && `・Flash ${pct(r.flash, r.tried)}%`}
                  </>
                }
                right={<Pills r={r} />}
              />
            ))}
          </ul>
        ) : (
          <Empty>目前沒有特別難或特別簡單的路線（或是試過的人還太少）。</Empty>
        )}
        {routes.length > 0 && (
          <LinkButton className="mt-2" onClick={() => setAll((v) => !v)}>
            {all ? "只看標出來的路線" : `看全部 ${routes.length} 條路線`}
          </LinkButton>
        )}
      </section>

      <section id="cold">
        <SectionTitle>冷門路線</SectionTitle>
        <Tip>
          上牆 {COLD_DAYS} 天以上、記錄 {COLD_MAX} 筆以下的路線，換線時可以先換。
        </Tip>
        {cold.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {cold.slice(0, 10).map((r) => (
              <InsightRouteRow
                key={r.id}
                grade={r.grade}
                title={routeTitle(r)}
                meta={
                  <>
                    上牆 <b className="font-num text-ink">{r.days}</b> 天・<b className="font-num text-ink">{r.tried}</b> 人記錄
                  </>
                }
                right={<InsightPill tone="plain">可先換</InsightPill>}
              />
            ))}
          </ul>
        ) : (
          <Empty>沒有冷門路線。</Empty>
        )}
        {cold.length > 10 && <Tip>另外還有 {cold.length - 10} 條。</Tip>}
      </section>

      <section id="zones">
        <SectionTitle>各區熱度（最近 30 天）</SectionTitle>
        {zones.length ? (
          <MeterList>
            {zones.map((z) => (
              <MeterRow
                key={z.name}
                label={<b>{z.name}</b>}
                value={(z.records / zmax) * 100}
                right={
                  <>
                    <b className="font-num text-ink">{z.records}</b> 筆・{z.users} 人
                  </>
                }
              />
            ))}
          </MeterList>
        ) : (
          <Empty>還沒有路線。</Empty>
        )}
      </section>

      <section id="resets">
        <SectionTitle>換線效果</SectionTitle>
        <Tip>最近 60 天換線的區域：換線前 7 天和換線後 7 天，那幾區的記錄筆數。</Tip>
        {data.resets.length ? (
          <MeterList>
            {data.resets.map((e) => {
              const max = Math.max(1, e.before, e.after);
              return (
                <li key={`${e.label}${e.starts_on}`} className="grid gap-1.5 rounded-btn bg-surface px-3 py-2.5 shadow-card">
                  <span className="text-note">
                    <b>{e.label}</b>
                    <span className="ml-1.5 text-meta text-muted">
                      {md(e.starts_on)}–{md(e.ends_on)}
                      {e.days_after < 7 && `（換線後才 ${e.days_after} 天）`}
                    </span>
                  </span>
                  <ul className="m-0 grid list-none gap-1.5 p-0">
                    <MeterRow label="換線前" value={(e.before / max) * 100} right={<b className="font-num text-ink">{e.before}</b>} muted />
                    <MeterRow label="換線後" value={(e.after / max) * 100} right={<b className="font-num text-ink">{e.after}</b>} />
                  </ul>
                </li>
              );
            })}
          </MeterList>
        ) : (
          <Empty>最近 60 天沒有換線公告（在「營運 → 換線日」輸入換線日才算得出來）。</Empty>
        )}
      </section>

      <section id="supply">
        <SectionTitle>難度供需</SectionTitle>
        <Tip>灰色是牆上路線佔幾 %，主色是最近 30 天的完攀佔幾 %。主色長很多＝很多人爬、牆上比較少。</Tip>
        {supply.length ? (
          <div className="grid gap-3">
            {supply.map((s) => (
              <div key={s.band}>
                <p className="mt-0 mb-1 text-note font-bold">{SUPPLY_LABEL[s.band]}</p>
                <MeterList>
                  <MeterRow label="牆上" value={s.wallPct} right={`${s.wallPct}%・${s.wall} 條`} muted />
                  <MeterRow label="完攀" value={s.sendPct} right={`${s.sendPct}%・${s.sends} 條`} />
                </MeterList>
              </div>
            ))}
          </div>
        ) : (
          <Empty>還沒有路線。</Empty>
        )}
      </section>

      <section id="top">
        <SectionTitle>熱門路線（最近 30 天最多人完攀）</SectionTitle>
        {data.top.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {data.top.map((r) => (
              <InsightRouteRow
                key={r.id}
                grade={r.grade}
                title={routeTitle(r)}
                right={
                  <span className="text-meta text-muted">
                    <b className="font-num text-ink">{r.n}</b> 人完攀
                  </span>
                }
              />
            ))}
          </ul>
        ) : (
          <Empty>最近 30 天還沒有完攀紀錄。</Empty>
        )}
      </section>
    </>
  );
}
