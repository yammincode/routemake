import type { Metadata } from "next";
import DesignShowcase from "./DesignShowcase";

export const metadata: Metadata = {
  title: "元件展示 | 原岩路線",
  robots: { index: false, follow: false },
};

// 元件展示頁：所有共用元件用示範資料排在一起，用來跟原型對照。正式上線前關閉
export default function DesignPage() {
  return <DesignShowcase />;
}
