import { randomUUID } from "node:crypto";

import { defineConfig } from "vitest/config";

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (!configuredDatabaseUrl) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const integrationSchema = `integration_${randomUUID()
  .replaceAll("-", "")
  .slice(0, 16)}`;
const integrationDatabaseUrl = new URL(configuredDatabaseUrl);
integrationDatabaseUrl.searchParams.set("schema", integrationSchema);
process.env.DATABASE_URL = integrationDatabaseUrl.toString();

export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    globalSetup: ["./test/integration-global-setup.ts"],
    env: {
      RUN_INTEGRATION_TESTS: "true",
      DATABASE_URL: integrationDatabaseUrl.toString()
    }
  }
});
