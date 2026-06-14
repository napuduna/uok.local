import bcrypt from "bcrypt";

import { PrismaClient } from "../src/generated/client/client.js";
import {
  UserRole,
  type UserRole as UserRoleValue
} from "../src/generated/client/enums.js";
import { createDatabaseAdapter } from "../src/client.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({
  adapter: createDatabaseAdapter(databaseUrl)
});

const roleDescriptions: Record<UserRoleValue, string> = {
  ADMIN: "จัดการทุกอย่าง",
  MANAGER: "ดูรายงานและยอดขาย",
  SALES: "ขายสินค้าและดูแลลูกค้า",
  WAREHOUSE: "รับเข้าและจัดการคลัง"
};

async function main() {
  const roles = await Promise.all(
    Object.values(UserRole).map((roleName: UserRoleValue) =>
      prisma.role.upsert({
        where: { name: roleName },
        update: { description: roleDescriptions[roleName] },
        create: {
          name: roleName,
          description: roleDescriptions[roleName]
        }
      })
    )
  );

  await prisma.warehouse.upsert({
    where: { code: "MAIN" },
    update: {
      isActive: true,
      isDefault: true,
      name: "คลังหลัก"
    },
    create: {
      code: "MAIN",
      name: "คลังหลัก",
      isDefault: true
    }
  });

  const adminRole = roles.find((role) => role.name === UserRole.ADMIN);

  if (!adminRole) {
    throw new Error("ADMIN role was not seeded");
  }

  const password = process.env.DEV_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email: "admin@uok.local" },
    update: {
      isActive: true,
      name: "ผู้ดูแลระบบ",
      passwordHash,
      roleId: adminRole.id
    },
    create: {
      email: "admin@uok.local",
      name: "ผู้ดูแลระบบ",
      passwordHash,
      roleId: adminRole.id
    }
  });
}

await main();
await prisma.$disconnect();
