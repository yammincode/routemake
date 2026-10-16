"use client";

import { useState } from "react";
import { Empty, SectionTitle, Tip } from "@/components/ui/Card";
import { ReportAction, ReportCount, ReportItem, ReportList } from "@/components/ui/Report";
import { HoldDot } from "@/components/ui/Route";
import { useToast } from "@/components/ui/Toast";
import { archiveRoute, fixRoute, handleRouteReports, type ReportStatus } from "@/lib/data";
import { ago } from "@/lib/date";
import { gradeLabel } from "@/lib/design";
import { REPORT_KIND, type ReportGroup } from "@/lib/reports";

// 管理後台「路線回報」（step47）：這間館還沒處理的回報，同一件事合成一則（lib/reports.ts）
// 點一則：上面切到那一區、照片上標出位置（虛線圈）；處理：
// - 沒標到的：「＋ 新增這條」打開新增路線（帶入位置、顏色、猜的難度）、「已經有了」、「不是路線」
// - 顏色不對：「改成○色」；位置標錯：「移到回報的位置」；已經拆了：「下架這條」（按兩次）；都可以按「沒問題」
export default function RouteReportsPanel({
  groups,
  ready,
  selected,
  onSelect,
  onAdd,
  onDone,
}: {
  groups: ReportGroup[] | null;
  ready: boolean;
  selected: string | null;
  onSelect: (g: ReportGroup) => void;
  onAdd: (g: ReportGroup) => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const run = async (g: ReportGroup, status: ReportStatus, msg: string, fix?: () => Promise<void>) => {
    setBusy(true);
    try {
      await fix?.();
      await handleRouteReports(
        g.items.map((i) => i.id),
        status,
        status === "fixed" || status === "ok" ? g.route_id : null
      );
      toast(msg);
      setConfirm(null);
      onDone();
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy(false);
  };

  const total = groups?.reduce((n, g) => n + g.items.length, 0) ?? 0;
  return (
    <>
      <SectionTitle>
        路線回報
        <ReportCount n={total} />
      </SectionTitle>
      {!ready ? (
        <Tip>資料庫還沒套用路線回報（step47），請老闆在 Supabase 執行 step47 後才收得到客人的回報。</Tip>
      ) : groups == null ? (
        <Empty>讀取中…</Empty>
      ) : groups.length === 0 ? (
        <Empty>目前沒有還沒處理的回報。客人在區域頁最下面、路線卡片可以回報沒標到的路線或標錯的地方。</Empty>
      ) : (
        <>
          <Tip>點一則，下面的照片會切到那一區、用虛線圈標出位置。</Tip>
          <ReportList>
            {groups.map((g) => {
              const names = [...new Set(g.items.map((i) => i.nickname ?? "（未填暱稱）"))];
              const latest = g.items[g.items.length - 1].created_at;
              const route = g.route_code ? `${g.route_code}（${g.route_color ?? ""}色 ${g.route_grade != null ? gradeLabel(g.route_grade) : ""}）` : null;
              return (
                <ReportItem
                  key={g.key}
                  selected={selected === g.key}
                  onSelect={() => onSelect(g)}
                  title={
                    <>
                      {g.kind === "missing" && g.color && <HoldDot color={g.color} />}
                      {REPORT_KIND[g.kind]}
                      {g.kind === "missing" ? `：${g.color}色${g.grade != null ? `・猜 ${gradeLabel(g.grade)}` : ""}` : `：${route ?? ""}`}
                      {g.kind === "color" && g.color && (
                        <>
                          → <HoldDot color={g.color} />
                          {g.color}色
                        </>
                      )}
                    </>
                  }
                  meta={`${g.zone_name}・${g.items.length > 1 ? `${g.items.length} 人回報・` : ""}${names.join("、")}・${ago(latest)}`}
                  notes={g.items.filter((i) => i.note).map((i) => ({ who: i.nickname ?? "（未填暱稱）", text: i.note! }))}
                  actions={
                    g.kind === "missing" ? (
                      <>
                        <ReportAction main disabled={busy} onClick={() => onAdd(g)}>
                          ＋ 新增這條
                        </ReportAction>
                        <ReportAction disabled={busy} onClick={() => void run(g, "added", "已標成處理好")}>
                          已經有了
                        </ReportAction>
                        <ReportAction disabled={busy} onClick={() => void run(g, "rejected", "已標成不是路線")}>
                          不是路線
                        </ReportAction>
                      </>
                    ) : (
                      <>
                        {g.kind === "color" && g.color && (
                          <ReportAction main disabled={busy} onClick={() => void run(g, "fixed", `已改成${g.color}色`, () => fixRoute(g.route_id!, { hold_color: g.color! }))}>
                            改成{g.color}色
                          </ReportAction>
                        )}
                        {g.kind === "pin" && g.x != null && g.y != null && (
                          <ReportAction main disabled={busy} onClick={() => void run(g, "fixed", "已移到回報的位置", () => fixRoute(g.route_id!, { pin_x: g.x!, pin_y: g.y! }))}>
                            移到回報的位置
                          </ReportAction>
                        )}
                        {g.kind === "gone" && (
                          <ReportAction
                            main
                            disabled={busy}
                            className={confirm === g.key ? "text-warn" : ""}
                            onClick={() =>
                              confirm === g.key ? void run(g, "fixed", `已下架 ${g.route_code}`, () => archiveRoute(g.route_id!)) : setConfirm(g.key)
                            }
                          >
                            {confirm === g.key ? `確定下架 ${g.route_code}？影片會一起刪除，再按一次` : "下架這條"}
                          </ReportAction>
                        )}
                        <ReportAction disabled={busy} onClick={() => void run(g, "ok", "已標成沒問題")}>
                          沒問題
                        </ReportAction>
                      </>
                    )
                  }
                />
              );
            })}
          </ReportList>
        </>
      )}
    </>
  );
}
