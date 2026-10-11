"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getZoneOrder, type ZoneLink, type ZoneProgress } from "./data";
import { peekCache, withCache } from "./offline";

// 這間館的區域順序（跟館首頁區域卡片一樣，不含 Spray Wall）：區域頁的上一區／下一區、左右滑動換區用
// 1. 先用手機裡存的，畫面一出來就有按鈕（不會晚一點才冒出來把照片往下推）：
//    館首頁的資料（每次進館首頁都會更新，最新）→ 這份清單 → 沒登入時存的館首頁資料
// 2. 有網路時，每次打開區域頁再問一次最新的（店長剛改順序、改名字也跟得上）；左右滑換區不再問
function seed(gymId: string, uid?: string): ZoneLink[] | null {
  const home = (who: string) => peekCache<{ z?: ZoneProgress[] }>(`home:${gymId}:${who}`)?.z?.map((z) => ({ id: z.zone_id, name: z.name }));
  const mine = uid ? home(uid) : null;
  if (mine?.length) return mine;
  const own = peekCache<ZoneLink[]>(`zones:${gymId}`);
  if (own?.length) return own;
  const guest = home("guest");
  return guest?.length ? guest : null;
}

export function useZoneOrder(gymId: string | null, uid?: string): ZoneLink[] | null {
  const seeded = useMemo(() => (gymId ? seed(gymId, uid) : null), [gymId, uid]);
  const [fresh, setFresh] = useState<{ gym: string; zones: ZoneLink[] } | null>(null);
  const asked = useRef(new Set<string>()); // 這次打開區域頁問過的館
  useEffect(() => {
    if (!gymId || asked.current.has(gymId) || !navigator.onLine) return;
    asked.current.add(gymId);
    withCache(`zones:${gymId}`, () => getZoneOrder(gymId))
      .then(({ data }) => setFresh({ gym: gymId, zones: data }))
      .catch(() => asked.current.delete(gymId));
  }, [gymId]);
  return fresh && fresh.gym === gymId ? fresh.zones : seeded;
}
