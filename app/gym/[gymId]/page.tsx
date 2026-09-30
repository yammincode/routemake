import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { GYMS, findGym } from "@/lib/gyms";
import SoonView from "./SoonView";

export const dynamicParams = false;

export function generateStaticParams() {
  return GYMS.map((g) => ({ gymId: g.id }));
}

export default async function GymPage({ params }: PageProps<"/gym/[gymId]">) {
  const { gymId } = await params;
  const gym = findGym(gymId);
  if (!gym) notFound();
  if (gym.live) redirect("/");

  return (
    <>
      <Header gym={gym} />
      <SoonView name={gym.name} />
    </>
  );
}
