"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ErrorScreen";

// 畫面出錯時顯示中文說明（頁首、底部分頁照常顯示）
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => console.error(error), [error]);
  return <ErrorScreen kind="error" />;
}
