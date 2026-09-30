import Header from "@/components/Header";
import Placeholder from "@/components/Placeholder";
import { LIVE_GYM } from "@/lib/gyms";

export default function MePage() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <h1 className="mt-1 mb-4 text-[30px] leading-tight font-black">我的紀錄</h1>
      <Placeholder>每月完攀統計、攀爬日月曆建置中。</Placeholder>
    </>
  );
}
