"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { BackLink, PageTitle, SectionTitle } from "@/components/ui/Card";
import { GymRow } from "@/components/ui/Gym";
import { ResetLines } from "@/components/ui/Resets";
import { getResetCalendar } from "@/lib/data";
import { todayYmd } from "@/lib/date";
import { GYMS, gymPath, saveLastGym, SPRAY_WALLS, sprayPath } from "@/lib/gyms";
import { backOr } from "@/lib/nav";
import { withCache } from "@/lib/offline";
import { addDays, type ResetEvent } from "@/lib/resets";

// 選擇攀岩館：點一間就進到那間館；上一頁回到入口頁
// 每間館名字下面寫換線資訊（換線中、剛換好、之後的換線）；右上「看各館換線日」進換線行事曆
// 換線資料抓不到（沒網路、資料庫還沒套用 step27）就不顯示那幾行，選館照常
export default function GymPicker() {
  const router = useRouter();
  const today = todayYmd();
  const [events, setEvents] = useState<ResetEvent[]>([]);
  useEffect(() => {
    withCache("resets:picker", () => getResetCalendar(addDays(today, -8), addDays(today, 45)), setEvents)
      .then(({ data }) => setEvents(data))
      .catch(() => undefined);
  }, [today]);
  const linesFor = (gymId: string, spray: boolean) => {
    const mine = events.filter((e) => e.gym_id === gymId && e.spray === spray);
    return mine.length ? <ResetLines events={mine} today={today} /> : undefined;
  };
  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <BackLink onClick={() => backOr(router, "/")}>返回</BackLink>
        <Logo />
      </div>
      <PageTitle sub={GYMS.every((g) => g.live) ? "選擇你要去的館" : `${GYMS.filter((g) => !g.live).map((g) => g.name).join("、")}即將開放`}>選擇攀岩館</PageTitle>
      <div className="-mt-2 mb-3 flex justify-end">
        <Link href="/resets" className="py-1.5 text-sub font-bold text-accent">
          看各館換線日 ›
        </Link>
      </div>
      <div className="grid gap-2">
        {GYMS.map((g) => (
          <GymRow
            key={g.id}
            name={g.name}
            logo={g.logo}
            live={g.live}
            tag={g.live ? "" : undefined}
            lines={g.live ? linesFor(g.id, false) : undefined}
            selected={false}
            onClick={() => {
              saveLastGym(g.id);
              router.push(gymPath(g.id));
            }}
          />
        ))}
      </div>
      <SectionTitle>Spray Wall</SectionTitle>
      <div className="grid gap-2">
        {SPRAY_WALLS.map((s) => (
          <GymRow
            key={s.id}
            name={s.name}
            logo={s.logo}
            live
            tag="大家一起出路線"
            lines={linesFor(s.gymId, true)}
            selected={false}
            onClick={() => {
              saveLastGym(s.id);
              router.push(sprayPath(s.id));
            }}
          />
        ))}
      </div>
    </>
  );
}
