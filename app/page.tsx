import Header from "@/components/Header";
import Placeholder from "@/components/Placeholder";
import { LIVE_GYM } from "@/lib/gyms";

export default function Home() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <h1 className="mt-1 mb-1.5 text-[30px] leading-tight font-black">今天爬哪一區？</h1>
      <Placeholder>館內平面圖和各區路線建置中。</Placeholder>
    </>
  );
}
