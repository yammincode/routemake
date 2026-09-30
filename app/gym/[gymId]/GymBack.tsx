"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BackLink } from "@/components/ui/Card";
import { saveLastGym } from "@/lib/gyms";
import { backOr } from "@/lib/nav";

// 「‹ 選擇攀岩館」，並記住目前這間館
export default function GymBack({ gymId }: { gymId: string }) {
  const router = useRouter();
  useEffect(() => saveLastGym(gymId), [gymId]);
  return <BackLink onClick={() => backOr(router, "/gyms")}>選擇攀岩館</BackLink>;
}
