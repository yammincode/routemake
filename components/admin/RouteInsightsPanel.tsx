"use client";

import { useEffect, useState } from "react";
import RouteInsightsView from "@/components/admin/RouteInsights";
import { Button } from "@/components/ui/Button";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { NO_INSIGHTS, getRouteInsights, type RouteInsights } from "@/lib/data";

// 管理後台「路線分析」（這間館的員工：定線員、店長；老闆）：按了才讀，內容跟使用狀況的「路線」分頁一樣
export default function RouteInsightsPanel({ gymId, gymName }: { gymId: string; gymName: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RouteInsights | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  // 換館時收起來
  useEffect(() => {
    void Promise.resolve().then(() => {
      setOpen(false);
      setData(undefined);
      setError(null);
    });
  }, [gymId]);

  const load = async () => {
    setOpen(true);
    setData(undefined);
    setError(null);
    try {
      setData(await getRouteInsights(gymId));
    } catch (e) {
      setError((e as Error).message);
    }
  };

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
          <RouteInsightsView data={data} />
          <Button className="mt-4" onClick={() => setOpen(false)}>
            收起來
          </Button>
        </>
      )}
    </section>
  );
}
