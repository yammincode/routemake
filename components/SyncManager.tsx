"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { clearAscent, saveAscent } from "@/lib/data";
import { flushPending, useOnline, usePendingCount } from "@/lib/offline";
import type { Status } from "@/lib/design";

// 送不出去時隔多久再試一次（收訊時好時壞，手機一直顯示「有網路」）
const RETRY_MS = 30_000;

// 連上網路時自動送出離線時記的紀錄（只送目前登入的人自己的）；沒網路時在頁面上方提示
export default function SyncManager() {
  const toast = useToast();
  const online = useOnline();
  const { session } = useAuth();
  const uid = session?.user.id;
  const pending = usePendingCount(uid);
  // 送不出去之後：過一陣子、或 App 回到前景時再試
  const [retry, setRetry] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!online || !pending || !uid) return;
    void flushPending(uid, async (p) => {
      if (p.ascent) await saveAscent(p.userId, p.routeId, { ...p.ascent, status: p.ascent.status as Status });
      else await clearAscent(p.userId, p.routeId);
    }).then((r) => {
      if (r.sent > 0) toast(`已送出 ${r.sent} 筆離線時的紀錄`);
      if (r.dropped > 0) toast(`有 ${r.dropped} 筆離線時的紀錄存不進去${r.reason ? `：${r.reason}` : ""}`);
      if (r.sent > 0 || r.dropped > 0) window.dispatchEvent(new Event("routemake:synced"));
      if (r.stuck) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      }
    });
  }, [online, pending, uid, retry, toast]);

  useEffect(() => {
    const again = () => document.visibilityState === "visible" && setRetry((n) => n + 1);
    document.addEventListener("visibilitychange", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      clearTimeout(timer.current);
    };
  }, []);

  if (online && !pending) return null;
  return (
    <div role="status" className="mb-3 rounded-btn bg-sunk px-3.5 py-2.5 text-note text-muted">
      {online ? `正在送出 ${pending} 筆紀錄…` : `目前沒有網路，顯示的是上次讀到的資料${pending ? `；${pending} 筆紀錄會在連上網路後送出` : ""}`}
    </div>
  );
}
