import type { Metadata } from "next";
import Header from "@/components/Header";
import LoginGate from "@/components/LoginGate";
import OpsView from "@/components/OpsView";
import { PageTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "營運 | 原岩路線" };

// 營運分頁（老闆和老闆授權的人）：使用狀況、換線日；老闆在這裡授權
export default function OpsPage() {
  return (
    <>
      <Header />
      <PageTitle sub="使用狀況、換線日">營運</PageTitle>
      <LoginGate next="/ops" intro="營運給老闆和老闆授權的人使用">
        <OpsView />
      </LoginGate>
    </>
  );
}
