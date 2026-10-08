"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BackLink } from "@/components/ui/Card";
import { saveLastGym } from "@/lib/gyms";
import { upTo } from "@/lib/nav";
import { markOpen } from "@/lib/usage";

// 「‹ 選擇攀岩館」，並記住目前這間館；一定到選館頁（從我的紀錄、換館過來時上一頁不是選館頁）
export default function GymBack({ gymId }: { gymId: string }) {
  const router = useRouter();
  useEffect(() => {
    saveLastGym(gymId);
    void markOpen(gymId);
  }, [gymId]);
  return <BackLink onClick={() => upTo(router, "/gyms")}>選擇攀岩館</BackLink>;
}
