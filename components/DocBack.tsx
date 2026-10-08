"use client";

import { useRouter } from "next/navigation";
import { BackLink } from "@/components/ui/Card";
import { backOr } from "@/lib/nav";

// 說明文件頁（隱私權政策、留言與影片規範）的「‹ 返回」：加到主畫面後沒有瀏覽器的上一頁按鈕
export default function DocBack() {
  const router = useRouter();
  return <BackLink onClick={() => backOr(router, "/")}>返回</BackLink>;
}
