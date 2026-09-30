"use client";

import { useSearchParams } from "next/navigation";
import ZoneView from "@/components/ZoneView";
import { Empty } from "@/components/ui/Card";

export default function ZonePageClient() {
  const id = useSearchParams().get("id");
  if (!id) return <Empty>找不到這個區域。</Empty>;
  return <ZoneView key={id} zoneId={id} />;
}
