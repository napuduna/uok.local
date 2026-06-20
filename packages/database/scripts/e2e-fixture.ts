import { PrismaClient } from "../src/generated/client/client.js";
import { UserRole } from "../src/generated/client/enums.js";
import { createDatabaseAdapter } from "../src/client.js";

const salesFixtureEmail = "sales.e2e@uok.local";
const productFixtureCode = "E2E-PRODUCT-AUTO";
const stockInProductFixtureCode = "E2E-STOCK-IN-PRODUCT";
const customerFixtureCode = "E2E-CUSTOMER-AUTO";
const saleProductFixtureCode = "E2E-SALE-PRODUCT";
const saleCustomerFixtureCode = "E2E-SALE-CUSTOMER";
const saleLotNumber = "E2E-SALE-LOT";
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
    const [admin, salesRole, category, unit, warehouse] = await Promise.all([
      database.user.findUnique({ where: { email: "admin@uok.local" } }),
      database.role.findUnique({ where: { name: UserRole.SALES } }),
      database.category.findUnique({ where: { code: "GENERAL" } }),
      database.unit.findUnique({ where: { code: "PCS" } }),
      database.warehouse.findFirst({
        where: { isDefault: true, isActive: true }
      })
    ]);

    if (!admin || !salesRole || !category || !unit || !warehouse) {
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
    await database.customer.deleteMany({
      where: { code: customerFixtureCode }
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

    const saleProduct = await database.product.upsert({
      where: { code: saleProductFixtureCode },
      update: {
        name: "สินค้าทดสอบการขาย",
        categoryId: category.id,
        unitId: unit.id,
        salePrice: "30.00",
        lowStockThreshold: 50,
        isActive: true,
        archivedAt: null
      },
      create: {
        code: saleProductFixtureCode,
        name: "สินค้าทดสอบการขาย",
        categoryId: category.id,
        unitId: unit.id,
        salePrice: "30.00",
        lowStockThreshold: 50
      }
    });
    await database.customer.upsert({
      where: { code: saleCustomerFixtureCode },
      update: {
        firstName: "ลูกค้า",
        lastName: "ทดสอบการขาย",
        age: 30,
        gender: "UNSPECIFIED",
        address: "กรุงเทพฯ",
        phone: "080-000-0001",
        phoneNormalized: "0800000001",
        isActive: true,
        archivedAt: null
      },
      create: {
        code: saleCustomerFixtureCode,
        firstName: "ลูกค้า",
        lastName: "ทดสอบการขาย",
        age: 30,
        gender: "UNSPECIFIED",
        address: "กรุงเทพฯ",
        phone: "080-000-0001",
        phoneNormalized: "0800000001",
        joinedAt: new Date("2026-01-01T00:00:00.000Z")
      }
    });
    const existingSaleLot = await database.lot.findUnique({
      where: {
        productId_warehouseId_lotNumber: {
          productId: saleProduct.id,
          warehouseId: warehouse.id,
          lotNumber: saleLotNumber
        }
      }
    });
    if (!existingSaleLot) {
      await database.$transaction(async (transaction) => {
        const stockIn = await transaction.stockIn.create({
          data: {
            referenceNumber: "E2E-SALE-STOCK-IN",
            warehouseId: warehouse.id,
            receivedAt: new Date("2026-01-01T00:00:00.000Z"),
            idempotencyKey: "e2e-sale-stock-in",
            requestHash: "e2e-sale-stock-in",
            createdById: admin.id
          }
        });
        const lot = await transaction.lot.create({
          data: {
            productId: saleProduct.id,
            warehouseId: warehouse.id,
            lotNumber: saleLotNumber,
            receivedAt: new Date("2026-01-01T00:00:00.000Z"),
            unitCost: "20.00",
            receivedQuantity: 1000,
            availableQuantity: 1000
          }
        });
        await transaction.stockInItem.create({
          data: {
            stockInId: stockIn.id,
            productId: saleProduct.id,
            lotId: lot.id,
            quantity: 1000,
            unitCost: "20.00"
          }
        });
        await transaction.inventoryMovement.create({
          data: {
            type: "STOCK_IN",
            quantityDelta: 1000,
            lotId: lot.id,
            warehouseId: warehouse.id,
            actorId: admin.id,
            occurredAt: stockIn.receivedAt,
            referenceType: "STOCK_IN",
            referenceId: stockIn.id
          }
        });
      });
    }
  } else if (action === "cleanup") {
    await database.product.deleteMany({
      where: {
        code: { in: [productFixtureCode, stockInProductFixtureCode] }
      }
    });
    await database.customer.deleteMany({
      where: { code: customerFixtureCode }
    });
    await database.user.deleteMany({ where: { email: salesFixtureEmail } });
  } else {
    throw new Error("Expected E2E fixture action: setup or cleanup");
  }
} finally {
  await database.$disconnect();
}
