"use client";

import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { BackLink, PageTitle } from "@/components/ui/Card";
import { GymRow } from "@/components/ui/Gym";
import { GYMS, gymPath, saveLastGym } from "@/lib/gyms";
import { backOr } from "@/lib/nav";

// 選擇攀岩館：點一間就進到那間館；上一頁回到入口頁
export default function GymPicker() {
  const router = useRouter();
  return (
    <>
      <div className="mb-2.5 flex items-center justify-between">
        <BackLink onClick={() => backOr(router, "/")}>返回</BackLink>
        <Logo />
      </div>
      <PageTitle sub={GYMS.every((g) => g.live) ? "選擇你要去的館" : `${GYMS.filter((g) => !g.live).map((g) => g.name).join("、")}即將開放`}>選擇攀岩館</PageTitle>
      <div className="grid gap-2">
        {GYMS.map((g) => (
          <GymRow
            key={g.id}
            name={g.name}
            logo={g.logo}
            live={g.live}
            selected={false}
            onClick={() => {
              saveLastGym(g.id);
              router.push(gymPath(g.id));
            }}
          />
        ))}
      </div>
    </>
  );
}
