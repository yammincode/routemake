import { RELEASED, VERSION } from "@/lib/version";

// 版本號小灰字：打開 App 看一眼就知道新版有沒有上去
// 正式版（Netlify 建置）顯示「v1.1・2026/10/03 更新」；在自己電腦跑的試用版顯示「v1.1 試用版」
export function AppVersion({ className = "" }: { className?: string }) {
  const trial = process.env.NEXT_PUBLIC_RELEASE !== "1";
  return (
    <p data-app-version className={`m-0 text-center text-tiny text-muted ${className}`}>
      {trial ? `v${VERSION} 試用版` : `v${VERSION}・${RELEASED.replaceAll("-", "/")} 更新`}
    </p>
  );
}
