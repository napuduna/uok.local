import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  hasPermission,
  paginatedProductsResponseSchema,
  Permission
} from "@warehouse/contracts";

import { AdjustmentWorkspace } from "../../components/adjustment-workspace";
import { DashboardShell } from "../../components/dashboard-shell";
import { getCurrentUser } from "../../lib/server-auth";

export default async function AdjustmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, Permission.STOCK_MANAGE)) notFound();

  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(
    `${apiBaseUrl}/api/v1/products?page=1&pageSize=100&status=active`,
    {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store"
    }
  );
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  const products = paginatedProductsResponseSchema.parse(await response.json());

  return (
    <DashboardShell
      currentUser={user}
      pageTitle="ปรับสต๊อก"
      activePath="/adjustments"
    >
      <AdjustmentWorkspace products={products.items} />
    </DashboardShell>
  );
}
