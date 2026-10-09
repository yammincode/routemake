"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Card";

// 要先登入的頁面：沒登入顯示說明和登入按鈕，登入後等帳號資料讀到才顯示內容（權限由各頁自己判斷，真正的權限在資料庫擋）
export default function LoginGate({ next, intro, children }: { next: string; intro: string; children: ReactNode }) {
  const { ready, session, access } = useAuth();
  const router = useRouter();
  // 登入了卻一直讀不到帳號資料（例如網路問題或帳號資料缺漏），幾秒後改顯示說明
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!session || access) return;
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [session, access]);

  if (!ready) return <Empty>讀取中…</Empty>;
  if (session && !access)
    return <Empty>{slow ? "讀不到帳號資料，請確認網路後重新整理；還是不行請登出再登入。" : "讀取中…"}</Empty>;
  if (!session) {
    return (
      <>
        <Empty>{intro}，請先登入。</Empty>
        <div className="mt-3">
          <Button variant="primary" onClick={() => router.push(`/login?next=${next}`)}>
            登入
          </Button>
        </div>
      </>
    );
  }
  return <>{children}</>;
}
