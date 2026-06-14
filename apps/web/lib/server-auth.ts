import { cookies } from "next/headers";

import {
  currentSessionResponseSchema,
  type AuthenticatedUserResponse
} from "@warehouse/contracts";

export async function getCurrentUser(): Promise<AuthenticatedUserResponse | null> {
  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const parsed = currentSessionResponseSchema.safeParse(
      await response.json()
    );
    return parsed.success ? parsed.data.user : null;
  } catch {
    return null;
  }
}
