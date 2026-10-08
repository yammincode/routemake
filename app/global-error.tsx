"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ErrorScreen";
import "./globals.css";

// 連最外層版面都出錯時的畫面：要自己帶 html、body
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="zh-Hant">
      <body className="font-sans">
        <main className="mx-auto max-w-page px-4 pt-3 pb-28">
          <ErrorScreen kind="error" />
        </main>
      </body>
    </html>
  );
}
