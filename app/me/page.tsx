import Header from "@/components/Header";
import { Empty, PageTitle } from "@/components/ui/Card";
import { LIVE_GYM } from "@/lib/gyms";

export default function MePage() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <PageTitle>我的紀錄</PageTitle>
      <Empty>每月完攀統計、攀爬日月曆建置中。</Empty>
    </>
  );
}
