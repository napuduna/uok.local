import { redirect } from "next/navigation";

import { DashboardOverview } from "../components/dashboard-overview";
import { DashboardShell } from "../components/dashboard-shell";
import { formatThaiDate } from "../lib/format-thai-date";
import { getCurrentUser } from "../lib/server-auth";
import {
  getDashboardAlerts,
  getDashboardSummary
} from "../lib/server-dashboard";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const [dashboardAlerts, dashboardSummary] = await Promise.all([
    getDashboardAlerts(),
    getDashboardSummary()
  ]);
  if (!dashboardSummary) {
    throw new Error("Dashboard summary API request failed");
  }

  return (
    <DashboardShell
      currentUser={user}
      dashboardAlerts={dashboardAlerts}
      todayLabel={formatThaiDate(new Date())}
    >
      <DashboardOverview summary={dashboardSummary} alerts={dashboardAlerts} />
    </DashboardShell>
  );
}
