import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  hasPermission,
  paginatedLotsResponseSchema,
  Permission,
  productResponseSchema,
  reconciliationResponseSchema,
  stockSummaryResponseSchema
} from "@warehouse/contracts";

import { DashboardShell } from "../../../components/dashboard-shell";
import { InventoryWorkspace } from "../../../components/inventory-workspace";
import { getCurrentUser } from "../../../lib/server-auth";

interface ResponseSchema<T> {
  parse(value: unknown): T;
}

async function loadJson<T>(
  path: string,
  schema: ResponseSchema<T>
): Promise<T> {
  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store"
  });
  if (response.status === 404) notFound();
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return schema.parse(await response.json());
}

export default async function ProductInventoryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, Permission.STOCK_READ)) notFound();

  const { id } = await params;
  const [product, stock] = await Promise.all([
    loadJson(`/products/${id}`, productResponseSchema),
    loadJson(`/products/${id}/stock`, stockSummaryResponseSchema)
  ]);
  const [lots, reconciliation] = await Promise.all([
    loadJson(
      `/products/${id}/lots?page=1&pageSize=25&status=active&warehouseId=${stock.warehouse.id}`,
      paginatedLotsResponseSchema
    ),
    loadJson(
      `/products/${id}/reconciliation?warehouseId=${stock.warehouse.id}`,
      reconciliationResponseSchema
    )
  ]);

  return (
    <DashboardShell
      currentUser={user}
      pageTitle="สต๊อกสินค้า"
      activePath="/products"
    >
      <InventoryWorkspace
        product={product}
        stock={stock}
        lots={lots}
        reconciliation={reconciliation}
      />
    </DashboardShell>
  );
}
