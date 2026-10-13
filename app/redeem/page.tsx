import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import RedeemView from "@/components/RedeemView";

export const metadata: Metadata = { title: "大滿貫兌換 | 原岩路線" };

// 員工兌換頁：/redeem?c=兌換碼（櫃檯員工用手機相機掃顧客兌換卡上的 QR code 打開）
export default function RedeemPage() {
  return (
    <>
      <Header />
      <Suspense>
        <RedeemView />
      </Suspense>
    </>
  );
}
