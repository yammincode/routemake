import type { Metadata } from "next";
import UsageView from "@/components/admin/UsageView";
import Header from "@/components/Header";
import StaffGate from "@/components/StaffGate";
import { PageTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "使用狀況 | 原岩路線" };

// 使用狀況（店長、老闆）：活躍人數、每日趨勢、註冊、各館比較、熱門路線、統計起始日
export default function UsagePage() {
  return (
    <>
      <Header />
      <PageTitle sub="有多少人在用、用得多不多">使用狀況</PageTitle>
      <StaffGate>
        <UsageView />
      </StaffGate>
    </>
  );
}
