import Header from "@/components/Header";
import HomeView from "@/components/HomeView";
import { LIVE_GYM } from "@/lib/gyms";

export default function Home() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <HomeView gymId={LIVE_GYM.id} />
    </>
  );
}
