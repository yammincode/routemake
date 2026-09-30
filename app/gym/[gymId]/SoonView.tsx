"use client";

import { useRouter } from "next/navigation";
import { SoonBox } from "@/components/ui/Gym";
import { DEFAULT_GYM_PATH, LIVE_GYM, saveLastGym } from "@/lib/gyms";

export default function SoonView({ name }: { name: string }) {
  const router = useRouter();
  return (
    <SoonBox
      name={name}
      backLabel={`看${LIVE_GYM.name}`}
      onBack={() => {
        saveLastGym(LIVE_GYM.id);
        router.push(DEFAULT_GYM_PATH);
      }}
    />
  );
}
