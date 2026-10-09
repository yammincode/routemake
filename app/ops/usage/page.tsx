import type { Metadata } from "next";
import UsageView from "@/components/admin/UsageView";
import Header from "@/components/Header";
import LoginGate from "@/components/LoginGate";
import { PageTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "使用狀況 | 原岩路線" };

// 使用狀況（老闆和老闆授權的人，只看授權的館）：活躍人數、每日趨勢、註冊、各館比較、熱門路線、統計起始日
export default function UsagePage() {
  return (
    <>
      <Header />
      <PageTitle sub="有多少人在用、用得多不多">使用狀況</PageTitle>
      <LoginGate next="/ops/usage" intro="使用狀況給老闆和老闆授權的人看">
        <UsageView />
      </LoginGate>
    </>
  );
}
