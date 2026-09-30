import Header from "@/components/Header";
import Placeholder from "@/components/Placeholder";
import { LIVE_GYM } from "@/lib/gyms";

export default function AdminPage() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <h1 className="mt-1 mb-1.5 text-[30px] leading-tight font-black">管理後台</h1>
      <p className="mt-0 mb-4 text-[15px] text-muted">選區域，點照片上的起步點新增路線</p>
      <Placeholder>區域管理和標路線功能建置中。</Placeholder>
    </>
  );
}
