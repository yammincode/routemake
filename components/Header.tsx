"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "@/components/Logo";
import Sheet from "@/components/Sheet";
import { GYMS, type Gym } from "@/lib/gyms";

export default function Header({ gym }: { gym: Gym }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const pick = (g: Gym) => {
    setOpen(false);
    router.push(g.live ? "/" : `/gym/${g.id}`);
  };

  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <Logo />
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pr-3 pl-3.5 text-[15px] font-bold shadow-card"
        >
          {gym.live && <span className="size-2 rounded-full bg-accent" />}
          {gym.name}
          <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
            <path d="m7 9 5 5 5-5z" />
          </svg>
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <h2 className="m-0 text-[22px] font-bold">選擇場館</h2>
        <p className="mt-1 mb-3 text-sm text-muted">目前只有明德館開放路線紀錄</p>
        <div className="grid gap-2">
          {GYMS.map((g) => (
            <button
              key={g.id}
              onClick={() => pick(g)}
              aria-pressed={g.id === gym.id}
              className="flex w-full items-center justify-between rounded-xl bg-sunk px-4 py-3.5 text-left font-medium aria-pressed:shadow-[inset_0_0_0_2px_var(--ink)]"
            >
              <span>{g.name}</span>
              <small className={`text-[13px] ${g.live ? "font-bold text-accent" : "text-muted"}`}>{g.live ? "已上線" : "即將上線"}</small>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
