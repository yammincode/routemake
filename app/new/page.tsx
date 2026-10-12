import type { Metadata } from "next";
import Header from "@/components/Header";
import NewView from "@/components/NewView";
import { PageTitle } from "@/components/ui/Card";

export const metadata: Metadata = { title: "New~ | 原岩路線" };

// New~：大家最新分享的影片、留言（所有開放的館；不用登入也看得到）
export default function NewPage() {
  return (
    <>
      <Header />
      <PageTitle sub="大家今天分享的影片和留言，每次打開隨機排">New~</PageTitle>
      <NewView />
    </>
  );
}
