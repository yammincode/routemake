import { BRAND_MARK } from "@/lib/gyms";

// 頁面左上角的原岩 T 標誌
export default function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={BRAND_MARK} alt="原岩攀岩館" width={36} height={36} className="size-9" />;
}
