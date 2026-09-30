"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { clearAscent, saveAscent } from "@/lib/data";
import { flushPending, useOnline, usePendingCount } from "@/lib/offline";
import type { Status } from "@/lib/design";

// 連上網路時自動送出離線時記的紀錄；沒網路時在頁面上方提示
export default function SyncManager() {
  const toast = useToast();
  const online = useOnline();
  const pending = usePendingCount();

  useEffect(() => {
    if (!online || !pending) return;
    void flushPending(async (p) => {
      if (p.ascent) await saveAscent(p.userId, p.routeId, { ...p.ascent, status: p.ascent.status as Status });
      else await clearAscent(p.routeId);
    }).then((n) => {
      if (n > 0) {
        toast(`已送出 ${n} 筆離線時的紀錄`);
        window.dispatchEvent(new Event("routemake:synced"));
      }
    });
  }, [online, pending, toast]);

  if (online && !pending) return null;
  return (
    <div role="status" className="mb-3 rounded-btn bg-sunk px-3.5 py-2.5 text-note text-muted">
      {online ? `正在送出 ${pending} 筆紀錄…` : `目前沒有網路，顯示的是上次讀到的資料${pending ? `；${pending} 筆紀錄會在連上網路後送出` : ""}`}
    </div>
  );
}
