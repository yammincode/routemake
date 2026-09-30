import type { Metadata } from "next";
import { Suspense } from "react";
import ZonePageClient from "./ZonePageClient";

export const metadata: Metadata = { title: "區域路線 | 原岩路線" };

// 區域頁用同一個網址 /zone?id=…，手機只要存一份頁面，所有區域離線都打得開
export default function ZonePage() {
  return (
    <Suspense>
      <ZonePageClient />
    </Suspense>
  );
}
