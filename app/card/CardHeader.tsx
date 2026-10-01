"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import { LIVE_GYM, lastLiveGym } from "@/lib/gyms";

// 頁首顯示上次選的館（跟我的紀錄一樣）
export default function CardHeader() {
  const [gym, setGym] = useState(LIVE_GYM);
  useEffect(() => {
    void Promise.resolve().then(() => setGym(lastLiveGym()));
  }, []);
  return <Header gym={gym} />;
}
