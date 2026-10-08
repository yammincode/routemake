"use client";

import Header from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { PageTitle, Tip } from "@/components/ui/Card";

// 出錯、找不到頁面時的中文畫面（取代 Next.js 預設的英文頁）；不靠登入狀態，整個 App 壞掉時也能顯示
// 按鈕用整頁重新載入，畫面壞掉時比較保險
export default function ErrorScreen({ kind }: { kind: "error" | "notfound" }) {
  const go = (path: string) => window.location.assign(path);
  if (kind === "notfound")
    return (
      <>
        <Header />
        <PageTitle sub="網址可能打錯了，或這個頁面已經移除">找不到這個頁面</PageTitle>
        <Button variant="primary" onClick={() => go("/gyms")}>
          回到選擇攀岩館
        </Button>
      </>
    );
  return (
    <>
      <Header />
      <PageTitle sub="畫面出了問題，你的紀錄不會不見">出了點問題</PageTitle>
      <Button variant="primary" onClick={() => window.location.reload()}>
        重新整理
      </Button>
      <Button onClick={() => go("/feedback")}>回報問題</Button>
      <Tip>重新整理還是一樣的話，請按「回報問題」告訴我們你剛剛在做什麼。</Tip>
    </>
  );
}
