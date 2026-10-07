"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { BackLink, Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Grade } from "@/components/ui/Route";
import { SetBox, StatGrid, StatTile, TrendBars } from "@/components/ui/Stats";
import { useToast } from "@/components/ui/Toast";
import { getUsage, resetUsageSince, type UsageStats } from "@/lib/data";
import { GYMS } from "@/lib/gyms";

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;

// 使用狀況頁（獨立頁面）：店長看自己的館；老闆可以看全部館、各館比較，並設定「統計起始日」
// 「有使用」＝當天有打開 App，或有記錄攀爬、留言、分享影片（只算登入的人）
export default function UsageView() {
  const { access } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const owner = !!access?.is_owner;
  const myGyms = owner ? GYMS.filter((g) => g.live) : GYMS.filter((g) => access?.roles.some((r) => r.gym_id === g.id && r.role === "manager"));
  const [scope, setScope] = useState<string | null>(owner ? null : (myGyms[0]?.id ?? null)); // null＝全部館
  const [data, setData] = useState<UsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      setData(null);
      setPick(null);
      return getUsage(scope)
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError((e as Error).message));
    });
    return () => {
      alive = false;
    };
  }, [scope, reload]);

  if (!owner && myGyms.length === 0) return <Empty>使用狀況只有店長和老闆看得到。</Empty>;

  const all = scope == null;
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
      <BackLink onClick={() => router.push("/admin")}>管理後台</BackLink>
      {(owner || myGyms.length > 1) && (
        <ChipRow>
          {owner && (
            <Chip pressed={all} onClick={() => setScope(null)}>
              全部館
            </Chip>
          )}
          {myGyms.map((g) => (
            <Chip key={g.id} pressed={scope === g.id} onClick={() => setScope(g.id)}>
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
              items={data.daily.map((d) => ({ key: d.day, tick: md(d.day), title: `${md(d.day)}：${d.users} 人使用・完攀 ${d.sends} 條`, value: d.users }))}
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
