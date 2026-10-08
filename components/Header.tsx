"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "@/components/Logo";
import { GymRow } from "@/components/ui/Gym";
import Icon from "@/components/ui/Icon";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { GYMS, gymPath, saveLastGym, SPRAY_WALLS, sprayPath, type Gym } from "@/lib/gyms";

// 頁首：左上 Logo，右上場館切換（原型 .hd）；沒給 gym（管理後台）只有 Logo，館名由後台自己顯示
export default function Header({ gym }: { gym?: Gym }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const pick = (g: Gym) => {
    setOpen(false);
    saveLastGym(g.id);
    router.push(gymPath(g.id));
  };

  if (!gym)
    return (
      <div className="mb-2.5 flex items-center justify-between">
        <Logo />
      </div>
    );
  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-[5px] pr-3 pl-3.5 text-sub font-bold shadow-card"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gym.logo} alt="" width={22} height={22} className="-ml-1 size-[22px]" />
          {gym.name}
          <Icon name="down" />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <SheetTitle>選擇場館</SheetTitle>
        <SheetSub>{GYMS.every((g) => g.live) ? "選擇你要去的館" : `${GYMS.filter((g) => !g.live).map((g) => g.name).join("、")}即將開放`}</SheetSub>
        <div className="grid gap-2">
          {GYMS.map((g) => (
            <GymRow key={g.id} name={g.name} logo={g.logo} live={g.live} selected={g.id === gym.id} onClick={() => pick(g)} />
          ))}
          {SPRAY_WALLS.map((s) => (
            <GymRow
              key={s.id}
              name={s.name}
              logo={s.logo}
              live
              tag="Spray Wall"
              selected={s.id === gym.id}
              onClick={() => {
                setOpen(false);
                saveLastGym(s.id);
                router.push(sprayPath(s.id));
              }}
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}
