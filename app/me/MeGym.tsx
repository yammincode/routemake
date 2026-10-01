"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import MeView from "@/components/MeView";
import { PageTitle } from "@/components/ui/Card";
import { LIVE_GYM, lastLiveGym } from "@/lib/gyms";

// 我的紀錄：用上次選的館（已開放的）算「目前牆上進度」，頁首也顯示那間館
export default function MeGym() {
  const [gym, setGym] = useState(LIVE_GYM);
  useEffect(() => {
    void Promise.resolve().then(() => setGym(lastLiveGym()));
  }, []);
  return (
    <>
      <Header gym={gym} />
      <PageTitle>我的紀錄</PageTitle>
      <MeView key={gym.id} gymId={gym.id} />
    </>
  );
}
