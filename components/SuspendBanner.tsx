"use client";

import { useAuth } from "@/components/AuthProvider";
import { suspendActive, SuspendNotice } from "@/components/ui/Account";

// 被停權的人：每一頁最上面都有提示條（停權到哪天、原因、能做和不能做什麼）
export default function SuspendBanner() {
  const { session, access } = useAuth();
  const s = session ? access?.suspension : null;
  if (!s) return null;
  // 停權時間過了（手機裡的快取還沒更新）就不顯示
  if (!suspendActive(s.until)) return null;
  return <SuspendNotice until={s.until} reason={s.reason} />;
}
