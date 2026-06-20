import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { createDatabaseClient, Prisma } from "@warehouse/database";

const apiDirectory = process.cwd();
const require = createRequire(resolve(apiDirectory, "package.json"));
const databaseDirectory = resolve(apiDirectory, "../../packages/database");
const prismaCli = resolve(
  dirname(require.resolve("prisma/package.json")),
  "build/index.js"
);
const tsxCli = resolve(
  dirname(require.resolve("tsx/package.json")),
  "dist/cli.mjs"
);

function adminDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

async function run(
  command: string,
  args: string[],
  cwd: string,
  databaseUrl: string
): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test"
      },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Command exited with code ${code ?? "unknown"}`));
    });
  });
}

export default async function setup() {
  const isolatedDatabaseUrl = process.env.DATABASE_URL;
  if (!isolatedDatabaseUrl) {
    throw new Error("DATABASE_URL is required for integration tests");
  }

  const schema = new URL(isolatedDatabaseUrl).searchParams.get("schema");
  if (!schema || !/^integration_[a-f0-9]{16}$/.test(schema)) {
    throw new Error("Integration DATABASE_URL must use an isolated schema");
  }

  const client = createDatabaseClient(adminDatabaseUrl(isolatedDatabaseUrl));
  await client.$executeRaw(Prisma.sql`CREATE SCHEMA ${Prisma.raw(`"${schema}"`)}`);
  await run(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--config", "prisma.config.ts"],
    databaseDirectory,
    isolatedDatabaseUrl
  );
  await run(
    process.execPath,
    [tsxCli, "prisma/seed.ts"],
    databaseDirectory,
    isolatedDatabaseUrl
  );

  return async () => {
    await client.$executeRaw(
      Prisma.sql`DROP SCHEMA IF EXISTS ${Prisma.raw(`"${schema}"`)} CASCADE`
    );
    await client.$disconnect();
  };
}
