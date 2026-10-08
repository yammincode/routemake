import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/Card";
import DocBack from "@/components/DocBack";
import { PrivacyContent } from "@/components/LegalDocs";
import { DraftNotice } from "@/components/ui/Doc";

export const metadata: Metadata = { title: "隱私權政策 | 原岩路線" };

// 隱私權政策（草稿）：內容依本 App 實際收集的資料撰寫
export default function PrivacyPage() {
  return (
    <>
      <DocBack />
      <PageTitle sub="最後更新：2026 年 10 月">隱私權政策</PageTitle>
      <DraftNotice />
      <PrivacyContent />
    </>
  );
}
