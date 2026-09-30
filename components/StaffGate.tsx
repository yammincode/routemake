"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Card";
import { isStaffOf } from "@/lib/auth";

// 只有員工（定線員、店長、老闆）才顯示內容；真正的權限由資料庫 RLS 擋
export default function StaffGate({ children }: { children: ReactNode }) {
  const { ready, session, access } = useAuth();
  const router = useRouter();

  if (!ready || (session && !access)) return <Empty>讀取中…</Empty>;
  if (!session) {
    return (
      <>
        <Empty>管理後台需要登入員工帳號。</Empty>
        <div className="mt-3">
          <Button variant="primary" onClick={() => router.push("/login?next=/admin")}>
            登入
          </Button>
        </div>
      </>
    );
  }
  if (!isStaffOf(access)) return <Empty>只有定線員和店長可以使用管理後台。需要權限請洽店長。</Empty>;
  return <>{children}</>;
}
