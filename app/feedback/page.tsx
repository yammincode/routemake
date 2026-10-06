import type { Metadata } from "next";
import FeedbackView from "@/components/FeedbackView";
import { PageTitle } from "@/components/ui/Card";
import CardHeader from "../card/CardHeader";

export const metadata: Metadata = { title: "意見回饋 | 原岩路線" };

// 意見回饋：使用者寫給開發者的想法與問題
export default function FeedbackPage() {
  return (
    <>
      <CardHeader />
      <PageTitle sub="想要什麼功能、哪裡不好用、遇到問題，都歡迎告訴我們">意見回饋</PageTitle>
      <FeedbackView />
    </>
  );
}
