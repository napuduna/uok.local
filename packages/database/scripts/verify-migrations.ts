import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const require = createRequire(import.meta.url);
const prismaPackageDirectory = dirname(require.resolve("prisma/package.json"));
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaCli = resolve(prismaPackageDirectory, "build", "index.js");
const migrationsDirectory = resolve(packageDirectory, "prisma", "migrations");
const configuredDatabaseUrl = process.env.DATABASE_URL;
const previousReleaseMigrations = [
  "000001_foundation",
  "000002_products_master_data",
  "000003_inventory_ledger",
  "000004_stock_in",
  "000005_inventory_trigger_schema_scope",
  "000006_inventory_adjustments"
];

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

async function preparePreviousReleaseSchema(
  client: InstanceType<typeof Client>,
  schema: string
): Promise<void> {
  await client.query(`
    SET search_path TO "${schema}";

    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  for (const migrationName of previousReleaseMigrations) {
    const sql = await readFile(
      resolve(migrationsDirectory, migrationName, "migration.sql"),
      "utf8"
    );
    await client.query(`SET search_path TO "${schema}";\n${sql}`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(
      `
        INSERT INTO "_prisma_migrations" (
          "id",
          "checksum",
          "finished_at",
          "migration_name",
          "logs",
          "rolled_back_at",
          "started_at",
          "applied_steps_count"
        )
        VALUES ($1, $2, CURRENT_TIMESTAMP, $3, NULL, NULL, CURRENT_TIMESTAMP, 1);
      `,
      [randomUUID(), createHash("sha256").update(sql).digest("hex"), migrationName]
    );
  }
}

async function insertPreviousReleaseFixture(
  client: InstanceType<typeof Client>,
  schema: string
): Promise<void> {
  await client.query(`
    SET search_path TO "${schema}";

    INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), 'ADMIN', 'previous release admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (gen_random_uuid(), 'MANAGER', 'previous release manager', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (gen_random_uuid(), 'SALES', 'previous release sales', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (gen_random_uuid(), 'WAREHOUSE', 'previous release warehouse', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    DO $$
    DECLARE
      admin_role_id UUID;
      actor_id UUID;
      warehouse_id UUID;
      category_id UUID;
      unit_id UUID;
      product_id UUID;
      lot_id UUID;
      stock_in_id UUID;
    BEGIN
      SELECT "id" INTO admin_role_id FROM "Role" WHERE "name" = 'ADMIN';

      INSERT INTO "Warehouse" (
        "id", "code", "name", "isDefault", "isActive", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid(), 'PREV', 'Previous release warehouse', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING "id" INTO warehouse_id;

      INSERT INTO "User" (
        "id", "email", "name", "passwordHash", "roleId", "isActive", "sessionVersion", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid(), 'previous.fixture@uok.local', 'Previous Fixture', 'not-used', admin_role_id, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING "id" INTO actor_id;

      INSERT INTO "Category" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'PREV-CAT', 'Previous category', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING "id" INTO category_id;

      INSERT INTO "Unit" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), 'PREV-UNIT', 'Previous unit', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING "id" INTO unit_id;

      INSERT INTO "Product" (
        "id", "code", "name", "categoryId", "unitId", "salePrice", "lowStockThreshold", "isActive", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid(), 'PREV-PRODUCT', 'Previous product', category_id, unit_id, 125.00, 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING "id" INTO product_id;

      INSERT INTO "Lot" (
        "id", "productId", "warehouseId", "lotNumber", "receivedAt", "expiryDate", "unitCost", "receivedQuantity", "availableQuantity", "isActive", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid(), product_id, warehouse_id, 'PREV-LOT', CURRENT_TIMESTAMP, NULL, 75.00, 25, 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING "id" INTO lot_id;

      INSERT INTO "StockIn" (
        "id", "referenceNumber", "warehouseId", "receivedAt", "idempotencyKey", "requestHash", "createdById", "createdAt"
      )
      VALUES (
        gen_random_uuid(), 'PREV-STOCK-IN', warehouse_id, CURRENT_TIMESTAMP, 'prev-stock-in', 'prev-stock-in-hash', actor_id, CURRENT_TIMESTAMP
      )
      RETURNING "id" INTO stock_in_id;

      INSERT INTO "StockInItem" ("id", "stockInId", "productId", "lotId", "quantity", "unitCost")
      VALUES (gen_random_uuid(), stock_in_id, product_id, lot_id, 25, 75.00);

      INSERT INTO "InventoryMovement" (
        "id", "type", "quantityDelta", "lotId", "warehouseId", "actorId", "occurredAt", "referenceType", "referenceId"
      )
      VALUES (
        gen_random_uuid(), 'STOCK_IN', 25, lot_id, warehouse_id, actor_id, CURRENT_TIMESTAMP, 'STOCK_IN', stock_in_id::TEXT
      );

      INSERT INTO "InventoryAdjustment" (
        "id", "referenceNumber", "warehouseId", "lotId", "direction", "quantity", "quantityDelta", "reason", "beforeQuantity", "afterQuantity", "idempotencyKey", "requestHash", "createdById", "createdAt"
      )
      VALUES (
        gen_random_uuid(), 'PREV-ADJUSTMENT', warehouse_id, lot_id, 'DECREASE', 5, -5, 'previous fixture shrinkage', 25, 20, 'prev-adjustment', 'prev-adjustment-hash', actor_id, CURRENT_TIMESTAMP
      );

      INSERT INTO "InventoryMovement" (
        "id", "type", "quantityDelta", "lotId", "warehouseId", "actorId", "occurredAt", "referenceType", "referenceId", "reason"
      )
      VALUES (
        gen_random_uuid(), 'ADJUSTMENT_OUT', -5, lot_id, warehouse_id, actor_id, CURRENT_TIMESTAMP, 'ADJUSTMENT', 'PREV-ADJUSTMENT', 'previous fixture shrinkage'
      );
    END $$;
  `);
}

async function verifyPreviousReleaseUpgrade(
  client: InstanceType<typeof Client>,
  schema: string
): Promise<void> {
  await client.query(`SET search_path TO "${schema}"`);
  const migrationDirectories = await readdir(migrationsDirectory, {
    withFileTypes: true
  });
  const expectedMigrationCount = migrationDirectories.filter((entry) =>
    entry.isDirectory()
  ).length;
  const migrationResult = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "_prisma_migrations"`
  );
  if (migrationResult.rows[0]?.count !== String(expectedMigrationCount)) {
    throw new Error("Previous release schema did not apply all migrations");
  }

  const result = await client.query<{ product_count: string; lot_total: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE "Product"."code" = 'PREV-PRODUCT')::text AS product_count,
      COALESCE(SUM("Lot"."availableQuantity"), 0)::text AS lot_total
    FROM "Product"
    LEFT JOIN "Lot" ON "Lot"."productId" = "Product"."id";
  `);
  const row = result.rows[0];
  if (row?.product_count !== "1" || row.lot_total !== "20") {
    throw new Error("Previous release fixture did not survive migration");
  }

  await client.query(`SELECT 1 FROM "Customer" LIMIT 1`);
  await client.query(`SELECT 1 FROM "Sale" LIMIT 1`);
}

const schemas = {
  empty: createSchemaName("empty"),
  populated: createSchemaName("populated"),
  previousRelease: createSchemaName("previous_release")
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
  await preparePreviousReleaseSchema(client, schemas.previousRelease);
  await insertPreviousReleaseFixture(client, schemas.previousRelease);
  await runMigration(schemas.previousRelease);
  await verifyPreviousReleaseUpgrade(client, schemas.previousRelease);
  process.stdout.write("Previous release fixture migration passed\n");

  process.stdout.write("Migration verification passed\n");
} finally {
  for (const schema of Object.values(schemas)) {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  await client.end();
}
