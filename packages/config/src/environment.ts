import { z } from "zod";

const infrastructureSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  REDIS_URL: z.string().url().startsWith("redis://"),
  SESSION_SECRET: z.string().min(32)
});

const nodeEnvironmentSchema = z
  .enum(["development", "test", "production"])
  .default("development");

const portSchema = (defaultPort: number) =>
  z.coerce.number().int().min(1).max(65535).default(defaultPort);

const apiEnvironmentSchema = infrastructureSchema.extend({
  NODE_ENV: nodeEnvironmentSchema,
  API_PORT: portSchema(4000)
});

const workerEnvironmentSchema = infrastructureSchema.extend({
  NODE_ENV: nodeEnvironmentSchema,
  WORKER_PORT: portSchema(4001),
  EXPORT_ARTIFACT_DIR: z.string().min(1).default("/var/lib/uok/exports"),
  EXPORT_THAI_FONT_PATH: z
    .string()
    .min(1)
    .default(
      "/workspace/apps/worker/node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2"
    )
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function parseApiEnvironment(
  environment: Record<string, string | undefined>
): ApiEnvironment {
  return apiEnvironmentSchema.parse(environment);
}

export function parseWorkerEnvironment(
  environment: Record<string, string | undefined>
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(environment);
}
