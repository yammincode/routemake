"use client";

import { useEffect, useState } from "react";
import { Empty, SectionTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Grade } from "@/components/ui/Route";
import { SetBox, StatGrid, StatTile, TrendBars } from "@/components/ui/Stats";
import { getUsage, type UsageStats } from "@/lib/data";

// 使用狀況（店長看自己的館；老闆另外可以看全部館與各館比較）
// 「有使用」＝當天有打開 App，或有記錄攀爬、留言、分享影片（只算登入的人）
export default function UsagePanel({ gymId, gymName, owner }: { gymId: string; gymName: string; owner: boolean }) {
  const [scope, setScope] = useState<"gym" | "all">("gym");
  const [data, setData] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const gym = scope === "all" ? null : gymId;

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      setData(null);
      setPick(null);
      return getUsage(gym)
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError((e as Error).message));
    });
    return () => {
      alive = false;
    };
  }, [gym]);

  const rate = data && data.registered ? Math.round((data.month / data.registered) * 1000) / 10 : 0;
  const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

  return (
    <>
      <SectionTitle>使用狀況</SectionTitle>
      {owner && (
        <ChipRow>
          <Chip pressed={scope === "gym"} onClick={() => setScope("gym")}>
            {gymName}
          </Chip>
          <Chip pressed={scope === "all"} onClick={() => setScope("all")}>
            全部館
          </Chip>
        </ChipRow>
      )}
      {error ? (
        <Empty>{error}</Empty>
      ) : !data ? (
        <Empty>讀取中…</Empty>
      ) : (
        <>
          <StatGrid>
            <StatTile value={data.today} label="今天" />
            <StatTile value={data.week} label="7 天" />
            <StatTile value={data.month} label="30 天" />
            {scope === "all" ? <StatTile value={`${rate}%`} label="使用率" /> : <StatTile value={data.sends30} label="30 天完攀" />}
          </StatGrid>
          <p className="mt-2 mb-3 text-meta text-muted">
            活躍人數＝有打開 App 或有記錄、留言、影片的人（只算登入的人）。
            {scope === "all" ? `使用率＝30 天活躍 ÷ 註冊 ${data.registered} 人；本週新註冊 ${data.new7} 人。` : `全部註冊 ${data.registered} 人，本週新註冊 ${data.new7} 人。`}
          </p>
          <SetBox>
            <p className="mt-3 mb-1 text-sub font-bold">最近 30 天每天使用人數</p>
            <TrendBars
              label="最近 30 天每天使用人數"
              items={data.daily.map((d) => ({ key: d.day, tick: md(d.day), title: `${md(d.day)}：${d.users} 人使用・完攀 ${d.sends} 條`, value: d.users }))}
              selected={pick}
              onSelect={setPick}
            />
          </SetBox>

          {data.gyms && (
            <>
              <p className="mt-4 mb-2 text-sub font-bold">各館比較（最近 30 天）</p>
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

          <p className="mt-4 mb-2 text-sub font-bold">熱門路線（最近 30 天最多人完攀）</p>
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
      )}
    </>
  );
}
