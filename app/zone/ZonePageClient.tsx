"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import ZoneView, { type ZoneHead } from "@/components/ZoneView";
import { Empty } from "@/components/ui/Card";
import { SwipeHint, ZoneNav, type ZoneDir } from "@/components/ui/Gym";
import { readZoneAhead, type ZoneLink } from "@/lib/data";
import { hasCache, peekCache, useOnline, withCache } from "@/lib/offline";
import { attachSwipe } from "@/lib/swipe";
import { useZoneOrder } from "@/lib/zoneOrder";

// 區域頁：左右滑動（或標題下面的「‹ 上一區　下一區 ›」）換到同一館的上一區、下一區，順序跟館首頁的區域卡片一樣
// - 換區只換網址（replaceState），不重新載入整頁，也不會多一層上一頁：「‹ 明德館」、手機返回都直接回館首頁
// - 難度篩選記在這裡：換區後新的區有這個難度就照樣篩
// - 換區後報讀新區的名字；用按鈕換的，焦點停在同一邊的按鈕
// - 沒網路時只能換到手機裡存過的區
export default function ZonePageClient() {
  const id = useSearchParams().get("id");
  const { session } = useAuth();
  const uid = session?.user.id;
  const online = useOnline();
  const [here, setHere] = useState<ZoneHead | null>(null); // 讀到的這一區（館、名字）
  // 手機裡存過這一區：一開始就知道是哪一館，上一區／下一區跟畫面一起出來（不會晚一點才把照片往下推）
  const cachedGym = useMemo(() => (id ? (peekCache<{ z?: { gym_id: string } }>(`zone:${id}:${uid ?? "guest"}`)?.z?.gym_id ?? null) : null), [id, uid]);
  const order = useZoneOrder(here?.gymId ?? cachedGym, uid);
  const [grade, setGrade] = useState<number | null>(null);
  const [moved, setMoved] = useState<{ dir: ZoneDir; byButton: boolean; to: string } | null>(null); // 怎麼換到 to 這一區的
  const [say, setSay] = useState("");
  const [hint, setHint] = useState<ZoneDir | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  const i = order && id ? order.findIndex((z) => z.id === id) : -1;
  // 沒網路時，手機裡沒存過的區不能去
  const usable = (z: ZoneLink | undefined) => (z && (online || hasCache(`zone:${z.id}:${uid ?? "guest"}`)) ? z : undefined);
  const prev = i > 0 ? usable(order![i - 1]) : undefined;
  const next = i >= 0 && order && i < order.length - 1 ? usable(order[i + 1]) : undefined;
  const near = { prev, next };

  const go = useCallback(
    (dir: ZoneDir, byButton: boolean) => {
      const z = near[dir];
      if (!z || !here) return;
      setMoved({ dir, byButton, to: z.id });
      setHere({ ...here, zoneName: z.name });
      setHint(null);
      window.history.replaceState(null, "", `/zone?id=${encodeURIComponent(z.id)}`);
      window.scrollTo({ top: 0 });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- near 每次重算，看 id 就夠
    [id, here, prev?.id, next?.id]
  );

  // 手指：綁一次就好，用 ref 拿最新的上一區／下一區
  const latest = useRef({ near, go, online, uid });
  useEffect(() => {
    latest.current = { near, go, online, uid };
  });
  const hasId = id != null;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    return attachSwipe(el, () => ({
      can: (d) => !!latest.current.near[d],
      moving: () => content.current,
      onLock: (d) => {
        setHint(d && latest.current.near[d] ? d : null);
        // 往那邊滑就先讀那一區（有網路才讀）
        const z = d ? latest.current.near[d] : undefined;
        if (z && latest.current.online) void withCache(`zone:${z.id}:${latest.current.uid ?? "guest"}`, () => readZoneAhead(z.id, latest.current.uid)).catch(() => {});
      },
      onCommit: (d) => latest.current.go(d, false),
    }));
  }, [hasId]);

  // 換過來的這一區讀到了：報讀一次
  const said = useRef<string | null>(null);
  const arrived = moved && moved.to === id ? moved : null;
  const onZone = useCallback(
    (z: ZoneHead & { total: number }) => {
      setHere({ gymId: z.gymId, gymName: z.gymName, zoneName: z.zoneName });
      if (arrived && said.current !== id) {
        said.current = id;
        setSay(`${z.zoneName}，${z.total} 條路線`);
      }
    },
    [arrived, id]
  );

  if (!id) return <Empty>找不到這個區域。</Empty>;
  const target = hint ? near[hint] : undefined;
  return (
    // 整個區域頁都可以左右滑（含兩邊貼齊螢幕的篩選列；左右多出來的切掉，滑的時候不會整頁左右晃）
    <div ref={wrap} data-swipe className="-mx-4 min-h-[70svh] overflow-x-clip px-4">
      <div key={id} ref={content} className={arrived ? (arrived.dir === "next" ? "animate-zone-next" : "animate-zone-prev") : undefined}>
        <ZoneView
          zoneId={id}
          grade={grade}
          onGrade={setGrade}
          head={here && arrived ? here : null}
          onZone={onZone}
          nav={<ZoneNav prev={prev?.name} next={next?.name} onGo={(d) => go(d, true)} focus={arrived?.byButton ? arrived.dir : null} />}
        />
      </div>
      {target && <SwipeHint dir={hint!} name={target.name} />}
      {/* 換區後報讀新區（不用 role=status，那是離線同步的提示在用） */}
      <p aria-live="polite" className="sr-only">
        {say}
      </p>
    </div>
  );
}
