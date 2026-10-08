"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Card";
import { isStaffOf } from "@/lib/auth";

// 只有員工（定線長、店長、老闆）才顯示內容；真正的權限由資料庫 RLS 擋
export default function StaffGate({ children }: { children: ReactNode }) {
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
        <Empty>管理後台給定線長、店長使用，請先登入。</Empty>
        <div className="mt-3">
          <Button variant="primary" onClick={() => router.push("/login?next=/admin")}>
            登入
          </Button>
        </div>
      </>
    );
  }
  if (!isStaffOf(access))
    return (
      <Empty>
        管理後台是給原岩員工用的。如果你是新來的定線長或店長，請店長在管理後台「員工」輸入你的帳號（<b className="text-ink">{access?.username}</b>），指派完成後重新整理這頁。
      </Empty>
    );
  return <>{children}</>;
}
