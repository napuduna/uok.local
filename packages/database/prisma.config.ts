import "dotenv/config";

import { defineConfig } from "prisma/config";

const defaultDatabaseUrl =
  "postgresql://warehouse:warehouse@localhost:5432/warehouse?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl
  }
});
