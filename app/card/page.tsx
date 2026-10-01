import type { Metadata } from "next";
import MyCardEditor from "@/components/MyCardEditor";
import { PageTitle } from "@/components/ui/Card";
import CardHeader from "./CardHeader";

export const metadata: Metadata = { title: "人物卡 | 原岩路線" };

// 人物卡分頁：自己的人物卡與編輯
export default function CardPage() {
  return (
    <>
      <CardHeader />
      <PageTitle sub="讓留言、影片旁的名字多一點介紹；不是交友功能，沒有私訊">人物卡</PageTitle>
      <MyCardEditor />
    </>
  );
}
