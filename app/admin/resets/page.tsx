import type { Metadata } from "next";
import ResetAdmin from "@/components/admin/ResetAdmin";
import Header from "@/components/Header";
import { PageTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "換線日 | 原岩路線" };

// 換線日（老闆和老闆授權的人）：各館每月換線公告
export default function ResetAdminPage() {
  return (
    <>
      <Header />
      <PageTitle sub="照 LINE 換線公告輸入，各館選館頁、行事曆、區域卡片都會更新">換線日</PageTitle>
      <ResetAdmin />
    </>
  );
}
