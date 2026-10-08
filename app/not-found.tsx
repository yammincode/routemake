import type { Metadata } from "next";
import ErrorScreen from "@/components/ErrorScreen";

export const metadata: Metadata = { title: "找不到頁面 | 原岩路線" };

// 網址打錯、館代號不存在時的中文頁面
export default function NotFound() {
  return <ErrorScreen kind="notfound" />;
}
