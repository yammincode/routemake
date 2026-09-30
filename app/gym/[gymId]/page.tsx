import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import { GYMS, LIVE_GYM, findGym } from "@/lib/gyms";

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
      <div className="rounded-[18px] bg-surface px-6 py-10 text-center shadow-card">
        <strong className="mb-1.5 block text-[22px]">{gym.name}即將上線</strong>
        <p className="mt-0 mb-5 text-muted">路線資料建置中，完成後就能在這裡看路線、記錄完攀。</p>
        <Link href="/" className="mx-auto block max-w-[220px] rounded-xl border border-ink bg-ink px-1.5 py-3 text-center font-bold text-surface">
          看{LIVE_GYM.name}
        </Link>
      </div>
    </>
  );
}
