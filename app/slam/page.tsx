import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import LoginGate from "@/components/LoginGate";
import SlamView from "@/components/SlamView";

export const metadata: Metadata = { title: "大滿貫兌換卡 | 原岩路線" };

// 大滿貫兌換卡：/slam?g=難度（從我的紀錄 → 牆上進度「★ 兌換 ›」打開）
export default function SlamPage() {
  return (
    <>
      <Header />
      <LoginGate next="/me" intro="大滿貫兌換卡要登入才看得到">
        <Suspense>
          <SlamView />
        </Suspense>
      </LoginGate>
    </>
  );
}
