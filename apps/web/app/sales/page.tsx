import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  hasPermission,
  paginatedCustomersResponseSchema,
  paginatedSaleCatalogResponseSchema,
  paginatedSalesResponseSchema,
  Permission
} from "@warehouse/contracts";

import { DashboardShell } from "../../components/dashboard-shell";
import { SalesWorkspace } from "../../components/sales-workspace";
import { getCurrentUser } from "../../lib/server-auth";

export default async function SalesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canRead =
    hasPermission(user.role, Permission.SALE_READ_ALL) ||
    hasPermission(user.role, Permission.SALE_READ_OWN);
  const canCreate = hasPermission(user.role, Permission.SALE_CREATE);
  if (!canRead && !canCreate) notFound();

  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const headers = { cookie: cookieStore.toString() };
  const [salesResponse, customersResponse, catalogResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/api/v1/sales?page=1&pageSize=25&status=all`, {
      headers,
      cache: "no-store"
    }),
    fetch(
      `${apiBaseUrl}/api/v1/customers?page=1&pageSize=100&status=active`,
      { headers, cache: "no-store" }
    ),
    fetch(`${apiBaseUrl}/api/v1/sales/catalog?page=1&pageSize=25`, {
      headers,
      cache: "no-store"
    })
  ]);
  if (!salesResponse.ok || !customersResponse.ok || !catalogResponse.ok) {
    throw new Error("Sales page API request failed");
  }

  const sales = paginatedSalesResponseSchema.parse(await salesResponse.json());
  const customers = paginatedCustomersResponseSchema.parse(
    await customersResponse.json()
  );
  const catalog = paginatedSaleCatalogResponseSchema.parse(
    await catalogResponse.json()
  );

  return (
    <DashboardShell
      currentUser={user}
      pageTitle="การขาย"
      activePath="/sales"
    >
      <SalesWorkspace
        initialSales={sales}
        initialCustomers={customers.items}
        initialCatalog={catalog}
        canCreate={canCreate}
      />
    </DashboardShell>
  );
}
