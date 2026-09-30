"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "@/components/Logo";
import { GymRow } from "@/components/ui/Gym";
import Icon from "@/components/ui/Icon";
import Sheet, { SheetSub, SheetTitle } from "@/components/ui/Sheet";
import { GYMS, gymPath, saveLastGym, type Gym } from "@/lib/gyms";

// 頁首：左上 Logo，右上場館切換（原型 .hd）
export default function Header({ gym }: { gym: Gym }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const pick = (g: Gym) => {
    setOpen(false);
    saveLastGym(g.id);
    router.push(gymPath(g.id));
  };

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-[5px] pr-3 pl-3.5 text-sub font-bold shadow-card"
        >
          {gym.live && <span className="size-2 rounded-full bg-accent" />}
          {gym.name}
          <Icon name="down" />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <SheetTitle>選擇場館</SheetTitle>
        <SheetSub>目前只有明德館開放路線紀錄</SheetSub>
        <div className="grid gap-2">
          {GYMS.map((g) => (
            <GymRow key={g.id} name={g.name} live={g.live} selected={g.id === gym.id} onClick={() => pick(g)} />
          ))}
        </div>
      </Sheet>
    </>
  );
}
