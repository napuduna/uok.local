import { redirect } from "next/navigation";

import { DashboardShell } from "../components/dashboard-shell";
import { formatThaiDate } from "../lib/format-thai-date";
import { getCurrentUser } from "../lib/server-auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <DashboardShell
      currentUser={user}
      todayLabel={formatThaiDate(new Date())}
    />
  );
}
