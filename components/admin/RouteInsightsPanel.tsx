"use client";

import { useEffect, useRef, useState } from "react";
import RouteInsightsView from "@/components/admin/RouteInsights";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { NO_INSIGHTS, getRouteInsights, type RouteInsights } from "@/lib/data";
import { clearInsightsBack, peekInsightsBack, type InsightsBack } from "@/lib/insights";

// 管理後台「路線分析」（這間館的員工：定線員、店長；老闆）：按了才讀，內容跟使用狀況的「路線」分頁一樣
// 點路線去區域頁、「‹ 後台」回來時自動打開、捲回原本的位置
export default function RouteInsightsPanel({ gymId, gymName }: { gymId: string; gymName: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RouteInsights | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0); // 只用最後一次讀的結果（換館後舊的回來不算）
  const [back, setBack] = useState<InsightsBack | null>(null);

  const load = async () => {
    const id = ++req.current;
    setOpen(true);
    setData(undefined);
    setError(null);
    try {
      const d = await getRouteInsights(gymId);
      if (id === req.current) setData(d);
    } catch (e) {
      if (id === req.current) setError((e as Error).message);
    }
  };

  // 換館時收起來；從路線分析點進區域頁再回來的，打開同一間館的路線分析
  useEffect(() => {
    req.current++;
    const b = peekInsightsBack("admin");
    clearInsightsBack(); // 讀一次就丟（後台已經用它選好館了）
    void Promise.resolve().then(() => {
      setOpen(false);
      setData(undefined);
      setError(null);
      if (b && b.gym === gymId) {
        setBack(b);
        void load();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只看換館
  }, [gymId]);

  // 讀到了再捲回原本的位置
  useEffect(() => {
    if (!back || !data) return;
    window.scrollTo({ top: back.y });
    void Promise.resolve().then(() => setBack(null));
  }, [back, data]);

  return (
    <section>
      <SectionTitle>{gymName}路線分析</SectionTitle>
      <Tip>每條路線的完攀率（標出可能太難、太簡單）、冷門路線、各區熱度、換線效果、難度供需，給換線時參考。</Tip>
      {!open ? (
        <Button onClick={() => void load()}>📊 看路線分析</Button>
      ) : error ? (
        <Empty>{error}</Empty>
      ) : data === undefined ? (
        <Empty>讀取中…</Empty>
      ) : data === null ? (
        <Empty>{NO_INSIGHTS}</Empty>
      ) : (
        <>
          <RouteInsightsView data={data} gym={gymId} from="admin" initialAll={back?.all ?? false} />
          <Button className="mt-4" onClick={() => setOpen(false)}>
            收起來
          </Button>
        </>
      )}
    </section>
  );
}
