import { redirect } from "next/navigation";

import { DashboardShell } from "../components/dashboard-shell";
import { formatThaiDate } from "../lib/format-thai-date";
import { getCurrentUser } from "../lib/server-auth";
import { getDashboardAlerts } from "../lib/server-dashboard";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const dashboardAlerts = await getDashboardAlerts();

  return (
    <DashboardShell
      currentUser={user}
      dashboardAlerts={dashboardAlerts}
      todayLabel={formatThaiDate(new Date())}
    />
  );
}
