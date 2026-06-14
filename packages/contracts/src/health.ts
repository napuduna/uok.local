import { z } from "zod";

export const healthResponseSchema = z.object({
  service: z.enum(["api", "worker"]),
  status: z.literal("ok"),
  timestamp: z.string().datetime({ offset: true }),
  version: z.string().min(1)
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
