import { PrismaClient } from "../src/generated/client/client.js";
import { UserRole } from "../src/generated/client/enums.js";
import { createDatabaseAdapter } from "../src/client.js";

const salesFixtureEmail = "sales.e2e@uok.local";
const productFixtureCode = "E2E-PRODUCT-AUTO";
const stockInProductFixtureCode = "E2E-STOCK-IN-PRODUCT";
const action = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for E2E fixtures");
}

const database = new PrismaClient({
  adapter: createDatabaseAdapter(databaseUrl)
});

try {
  if (action === "setup") {
    const [admin, salesRole, category, unit] = await Promise.all([
      database.user.findUnique({ where: { email: "admin@uok.local" } }),
      database.role.findUnique({ where: { name: UserRole.SALES } }),
      database.category.findUnique({ where: { code: "GENERAL" } }),
      database.unit.findUnique({ where: { code: "PCS" } })
    ]);

    if (!admin || !salesRole || !category || !unit) {
      throw new Error("Run prisma:seed before Playwright tests");
    }

    await database.user.upsert({
      where: { email: salesFixtureEmail },
      update: {
        name: "E2E Sales",
        passwordHash: admin.passwordHash,
        roleId: salesRole.id,
        isActive: true,
        deactivatedAt: null,
        sessionVersion: { increment: 1 }
      },
      create: {
        email: salesFixtureEmail,
        name: "E2E Sales",
        passwordHash: admin.passwordHash,
        roleId: salesRole.id
      }
    });
    await database.product.deleteMany({
      where: { code: productFixtureCode }
    });
    await database.product.upsert({
      where: { code: stockInProductFixtureCode },
      update: {
        name: "สินค้าทดสอบรับเข้า",
        categoryId: category.id,
        unitId: unit.id,
        salePrice: "25.00",
        lowStockThreshold: 50,
        isActive: true,
        archivedAt: null
      },
      create: {
        code: stockInProductFixtureCode,
        name: "สินค้าทดสอบรับเข้า",
        categoryId: category.id,
        unitId: unit.id,
        salePrice: "25.00",
        lowStockThreshold: 50
      }
    });
  } else if (action === "cleanup") {
    await database.product.deleteMany({
      where: {
        code: { in: [productFixtureCode, stockInProductFixtureCode] }
      }
    });
    await database.user.deleteMany({ where: { email: salesFixtureEmail } });
  } else {
    throw new Error("Expected E2E fixture action: setup or cleanup");
  }
} finally {
  await database.$disconnect();
}
