import Header from "@/components/Header";
import StaffGate from "@/components/StaffGate";
import { Empty, PageTitle } from "@/components/ui/Card";
import { LIVE_GYM } from "@/lib/gyms";

export default function AdminPage() {
  return (
    <>
      <Header gym={LIVE_GYM} />
      <PageTitle sub="選區域，點照片上的起步點新增路線">管理後台</PageTitle>
      <StaffGate>
        <Empty>區域管理和標路線功能建置中。</Empty>
      </StaffGate>
    </>
  );
}
