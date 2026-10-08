import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/Card";
import DocBack from "@/components/DocBack";
import { RulesContent } from "@/components/LegalDocs";
import { DraftNotice } from "@/components/ui/Doc";

export const metadata: Metadata = { title: "留言與影片規範 | 原岩路線" };

// 留言與影片分享規範（草稿）
export default function RulesPage() {
  return (
    <>
      <DocBack />
      <PageTitle sub="讓每個人都能自在地分享 beta">留言與影片規範</PageTitle>
      <DraftNotice />
      <RulesContent />
    </>
  );
}
