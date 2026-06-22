import { cookies } from "next/headers";

import {
  dashboardAlertsResponseSchema,
  dashboardSummaryResponseSchema,
  type DashboardAlertsResponse,
  type DashboardSummaryResponse
} from "@warehouse/contracts";

export async function getDashboardAlerts(): Promise<DashboardAlertsResponse | null> {
  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/dashboard/alerts`, {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    const parsed = dashboardAlertsResponseSchema.safeParse(
      await response.json()
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getDashboardSummary(): Promise<DashboardSummaryResponse | null> {
  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/dashboard/summary`, {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    const parsed = dashboardSummaryResponseSchema.safeParse(
      await response.json()
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
