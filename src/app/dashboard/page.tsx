import { requireMember, loadDashboard } from "@/lib/server";
import { DashboardView } from "@/components/dashboard";

export const dynamic = "force-dynamic";
export default async function DashboardPage() {
  const viewer = await requireMember();
  return <DashboardView data={await loadDashboard(viewer)} />;
}
