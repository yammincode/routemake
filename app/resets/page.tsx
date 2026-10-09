import type { Metadata } from "next";
import ResetCalendarView from "@/components/ResetCalendarView";

export const metadata: Metadata = { title: "換線行事曆 | 原岩路線" };

// 換線行事曆：各館每月換線日（從選館頁右上角進來）
export default function ResetsPage() {
  return <ResetCalendarView />;
}
