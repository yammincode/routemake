import Header from "@/components/Header";
import { Empty, PageTitle } from "@/components/ui/Card";
import { LIVE_GYM } from "@/lib/gyms";

export default function Home() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <PageTitle sub="館內平面圖和各區路線建置中">今天爬哪一區？</PageTitle>
      <Empty>路線資料建置中，完成後就能在這裡選區域、看路線。</Empty>
    </>
  );
}
