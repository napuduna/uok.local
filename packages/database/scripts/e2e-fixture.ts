import { PrismaClient } from "../src/generated/client/client.js";
import { UserRole } from "../src/generated/client/enums.js";
import { createDatabaseAdapter } from "../src/client.js";

const salesFixtureEmail = "sales.e2e@uok.local";
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
    const [admin, salesRole] = await Promise.all([
      database.user.findUnique({ where: { email: "admin@uok.local" } }),
      database.role.findUnique({ where: { name: UserRole.SALES } })
    ]);

    if (!admin || !salesRole) {
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
  } else if (action === "cleanup") {
    await database.user.deleteMany({ where: { email: salesFixtureEmail } });
  } else {
    throw new Error("Expected E2E fixture action: setup or cleanup");
  }
} finally {
  await database.$disconnect();
}
