import Link from "next/link";
import AccountCard from "@/components/AccountCard";
import Header from "@/components/Header";
import MeView from "@/components/MeView";
import { PageTitle } from "@/components/ui/Card";
import { LIVE_GYM } from "@/lib/gyms";

export default function MePage() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <PageTitle>我的紀錄</PageTitle>
      <MeView gymId={LIVE_GYM.id} />
      <div className="mt-7">
        <AccountCard />
      </div>
      <p className="mt-4 text-center text-meta text-muted">
        <Link href="/privacy" className="underline">隱私權政策</Link>
        {" · "}
        <Link href="/rules" className="underline">留言與影片規範</Link>
      </p>
    </>
  );
}
