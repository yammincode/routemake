import { notFound } from "next/navigation";
import Header from "@/components/Header";
import SprayView from "@/components/SprayView";
import { SPRAY_WALLS, findSpray, sprayAsGym } from "@/lib/gyms";
import GymBack from "../../gym/[gymId]/GymBack";

export const dynamicParams = false;

export function generateStaticParams() {
  return SPRAY_WALLS.map((s) => ({ id: s.id }));
}

// Spray Wall 頁：公版岩牆、岩館路線／岩友路線
export default async function SprayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wall = findSpray(id);
  if (!wall) notFound();
  return (
    <>
      <GymBack gymId={wall.id} />
      <Header gym={sprayAsGym(wall)} />
      <SprayView wall={wall} />
    </>
  );
}
