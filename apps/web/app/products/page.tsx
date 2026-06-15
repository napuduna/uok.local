import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  hasPermission,
  masterDataListResponseSchema,
  paginatedProductsResponseSchema,
  Permission
} from "@warehouse/contracts";

import { DashboardShell } from "../../components/dashboard-shell";
import { ProductsWorkspace } from "../../components/products-workspace";
import { getCurrentUser } from "../../lib/server-auth";

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
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }
  return schema.parse(await response.json());
}

export default async function ProductsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [products, categories, units] = await Promise.all([
    loadJson(
      "/products?page=1&pageSize=25&status=active",
      paginatedProductsResponseSchema
    ),
    loadJson("/products/categories", masterDataListResponseSchema),
    loadJson("/products/units", masterDataListResponseSchema)
  ]);

  return (
    <DashboardShell
      currentUser={user}
      pageTitle="สินค้า"
      activePath="/products"
    >
      <ProductsWorkspace
        initialProducts={products}
        categories={categories}
        units={units}
        canManage={hasPermission(user.role, Permission.PRODUCT_MANAGE)}
        canViewStock={hasPermission(user.role, Permission.STOCK_READ)}
      />
    </DashboardShell>
  );
}
