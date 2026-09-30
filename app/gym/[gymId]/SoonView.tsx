"use client";

import { useRouter } from "next/navigation";
import { SoonBox } from "@/components/ui/Gym";
import { LIVE_GYM } from "@/lib/gyms";

export default function SoonView({ name }: { name: string }) {
  const router = useRouter();
  return <SoonBox name={name} backLabel={`看${LIVE_GYM.name}`} onBack={() => router.push("/")} />;
}
