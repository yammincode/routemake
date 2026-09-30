import Link from "next/link";
import { BRAND_LOGO } from "@/lib/gyms";

// 入口頁：中間放原岩攀岩館 Logo，點一下進入選擇攀岩館
export default function Landing() {
  return (
    <div className="flex min-h-[calc(100dvh-env(safe-area-inset-top,0px)-24px)] flex-col items-center justify-center text-center">
      <Link href="/gyms" aria-label="原岩攀岩館，點一下進入選擇攀岩館" className="group grid justify-items-center gap-3 rounded-plan p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_LOGO} alt="原岩攀岩館 T-UP CLIMBING" width={240} height={240} className="size-60 transition-transform duration-150 group-active:scale-95" />
        <span className="text-sub text-muted">路線・完攀紀錄・積分</span>
        <span className="mt-4 rounded-full border border-line bg-surface px-5 py-2 text-sub font-bold shadow-card">點一下進入</span>
      </Link>
    </div>
  );
}
