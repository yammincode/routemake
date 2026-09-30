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
    </>
  );
}
