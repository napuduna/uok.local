import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  hasPermission,
  paginatedCustomersResponseSchema,
  Permission
} from "@warehouse/contracts";

import { CustomersWorkspace } from "../../components/customers-workspace";
import { DashboardShell } from "../../components/dashboard-shell";
import { getCurrentUser } from "../../lib/server-auth";

export default async function CustomersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(
    `${apiBaseUrl}/api/v1/customers?page=1&pageSize=25&status=active`,
    {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error(
      `Customer API request failed with status ${response.status}`
    );
  }
  const customers = paginatedCustomersResponseSchema.parse(
    await response.json()
  );

  return (
    <DashboardShell
      currentUser={user}
      pageTitle="ลูกค้า"
      activePath="/customers"
    >
      <CustomersWorkspace
        initialCustomers={customers}
        canManage={hasPermission(user.role, Permission.CUSTOMER_MANAGE)}
      />
    </DashboardShell>
  );
}
