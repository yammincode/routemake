import { notFound } from "next/navigation";
import Header from "@/components/Header";
import HomeView from "@/components/HomeView";
import { GYMS, findGym } from "@/lib/gyms";
import GymBack from "./GymBack";
import SoonView from "./SoonView";

export const dynamicParams = false;

export function generateStaticParams() {
  return GYMS.map((g) => ({ gymId: g.id }));
}

// 各館頁：已上線的館顯示平面圖與路線，其他館顯示「即將上線」
export default async function GymPage({ params }: PageProps<"/gym/[gymId]">) {
  const { gymId } = await params;
  const gym = findGym(gymId);
  if (!gym) notFound();

  return (
    <>
      <GymBack gymId={gym.id} />
      <Header gym={gym} />
      {gym.live ? <HomeView gymId={gym.id} /> : <SoonView name={gym.name} />}
    </>
  );
}
