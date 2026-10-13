import type { Metadata } from "next";
import Header from "@/components/Header";
import LoginGate from "@/components/LoginGate";
import SlamOpsView from "@/components/admin/SlamOpsView";
import { PageTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "大滿貫兌換 | 原岩路線" };

// 大滿貫兌換設定（只有老闆）：活動開關、最少條數、期限、獎品；兌換紀錄
export default function SlamOpsPage() {
  return (
    <>
      <Header />
      <PageTitle sub="活動開關、兌換條件、兌換紀錄">大滿貫兌換</PageTitle>
      <LoginGate next="/ops/slam" intro="大滿貫兌換設定給老闆使用">
        <SlamOpsView />
      </LoginGate>
    </>
  );
}
