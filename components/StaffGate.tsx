"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import LoginGate from "@/components/LoginGate";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Card";
import { canOps, isStaffOf } from "@/lib/auth";

// 只有員工（定線長、店長、老闆）才顯示內容；真正的權限由資料庫 RLS 擋
export default function StaffGate({ children }: { children: ReactNode }) {
  return (
    <LoginGate next="/admin" intro="管理後台給定線長、店長使用">
      <StaffOnly>{children}</StaffOnly>
    </LoginGate>
  );
}

function StaffOnly({ children }: { children: ReactNode }) {
  const { access } = useAuth();
  const router = useRouter();
  if (isStaffOf(access)) return <>{children}</>;
  // 不是員工、但老闆授權看使用狀況或輸入換線日：這些在「營運」分頁
  if (canOps(access))
    return (
      <>
        <Empty>管理後台給定線長、店長使用。你可以用的使用狀況、換線日在「營運」分頁。</Empty>
        <div className="mt-3">
          <Button variant="primary" onClick={() => router.push("/ops")}>
            前往營運
          </Button>
        </div>
      </>
    );
  return (
    <Empty>
      管理後台是給原岩員工用的。如果你是新來的定線長或店長，請店長或老闆在管理後台「員工」輸入你的帳號（<b className="text-ink">{access?.username}</b>），指派完成後重新整理這頁。
    </Empty>
  );
}
