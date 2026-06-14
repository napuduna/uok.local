import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const require = createRequire(import.meta.url);
const prismaPackageDirectory = dirname(require.resolve("prisma/package.json"));
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCli = resolve(prismaPackageDirectory, "build", "index.js");
const configuredDatabaseUrl = process.env.DATABASE_URL;

if (!configuredDatabaseUrl) {
  throw new Error("DATABASE_URL is required to verify migrations");
}

const databaseUrl: string = configuredDatabaseUrl;

function createSchemaName(label: string): string {
  return `verify_${label}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function databaseUrlForSchema(schema: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

function adminDatabaseUrl(): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

async function runMigration(schema: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [prismaCli, "migrate", "deploy", "--config", "prisma.config.ts"],
      {
        cwd: packageDirectory,
        env: {
          ...process.env,
          DATABASE_URL: databaseUrlForSchema(schema)
        },
        stdio: "inherit"
      }
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`Migration exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

async function insertPopulatedFixture(
  client: InstanceType<typeof Client>,
  schema: string
): Promise<void> {
  await client.query(`
    SET search_path TO "${schema}";

    INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      'ADMIN',
      'migration verification role',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

    INSERT INTO "Warehouse" (
      "id",
      "code",
      "name",
      "isDefault",
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      gen_random_uuid(),
      'VERIFY',
      'Migration verification warehouse',
      true,
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  `);
}

const schemas = {
  empty: createSchemaName("empty"),
  populated: createSchemaName("populated")
};
const client = new Client({ connectionString: adminDatabaseUrl() });

await client.connect();

try {
  for (const schema of Object.values(schemas)) {
    await client.query(`CREATE SCHEMA "${schema}"`);
  }

  await runMigration(schemas.empty);
  await runMigration(schemas.populated);
  await insertPopulatedFixture(client, schemas.populated);
  await runMigration(schemas.populated);

  process.stdout.write("Migration verification passed\n");
} finally {
  for (const schema of Object.values(schemas)) {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await client.end();
}
