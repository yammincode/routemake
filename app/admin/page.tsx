import AdminView from "@/components/admin/AdminView";
import Header from "@/components/Header";
import StaffGate from "@/components/StaffGate";
import { PageTitle } from "@/components/ui/Card";

export default function AdminPage() {
  return (
    <>
      <Header />
      <PageTitle sub="選區域，點照片上的起步點新增路線">管理後台</PageTitle>
      <StaffGate>
        <AdminView />
      </StaffGate>
    </>
  );
}
