import { describe, expect, it } from "vitest";

import { hasPermission, Permission, Role } from "./rbac";

describe("hasPermission", () => {
  it("allows Admin to perform every declared capability", () => {
    for (const permission of Object.values(Permission)) {
      expect(hasPermission(Role.ADMIN, permission)).toBe(true);
    }
  });

  it("limits Sales to sales and customer workflows", () => {
    expect(hasPermission(Role.SALES, Permission.SALE_CREATE)).toBe(true);
    expect(hasPermission(Role.SALES, Permission.SALE_CANCEL)).toBe(true);
    expect(hasPermission(Role.SALES, Permission.REPORT_SALES_OWN)).toBe(true);
    expect(hasPermission(Role.SALES, Permission.STOCK_MANAGE)).toBe(false);
    expect(hasPermission(Role.SALES, Permission.USER_MANAGE)).toBe(false);
    expect(hasPermission(Role.SALES, Permission.COSTING_READ)).toBe(false);
  });

  it("allows Warehouse to manage stock but not sales", () => {
    expect(hasPermission(Role.WAREHOUSE, Permission.PRODUCT_MANAGE)).toBe(true);
    expect(hasPermission(Role.WAREHOUSE, Permission.STOCK_MANAGE)).toBe(true);
    expect(hasPermission(Role.WAREHOUSE, Permission.REPORT_STOCK)).toBe(true);
    expect(hasPermission(Role.WAREHOUSE, Permission.SALE_CREATE)).toBe(false);
    expect(hasPermission(Role.WAREHOUSE, Permission.SALE_CANCEL)).toBe(false);
  });

  it("keeps Manager read-only for operational mutations", () => {
    expect(hasPermission(Role.MANAGER, Permission.COSTING_READ)).toBe(true);
    expect(hasPermission(Role.MANAGER, Permission.REPORT_SALES_ALL)).toBe(true);
    expect(hasPermission(Role.MANAGER, Permission.STOCK_MANAGE)).toBe(false);
    expect(hasPermission(Role.MANAGER, Permission.SALE_CREATE)).toBe(false);
  });
});
