import { describe, expect, it } from "vitest";

import {
  createCustomerRequestSchema,
  customerListQuerySchema,
  customerPurchaseHistoryResponseSchema,
  customerResponseSchema
} from "./customer.js";

const customerId = "ac1d9514-b32e-4d03-865b-b46353705fe8";

describe("customer contracts", () => {
  it("normalizes customer code while preserving the displayed phone", () => {
    expect(
      createCustomerRequestSchema.parse({
        code: " c-001 ",
        firstName: "สมชาย",
        lastName: "ใจดี",
        age: 35,
        gender: "MALE",
        address: "กรุงเทพฯ",
        phone: "081-234-5678",
        joinedAt: "2026-06-15T00:00:00.000Z"
      })
    ).toEqual({
      code: "C-001",
      firstName: "สมชาย",
      lastName: "ใจดี",
      age: 35,
      gender: "MALE",
      address: "กรุงเทพฯ",
      phone: "081-234-5678",
      joinedAt: "2026-06-15T00:00:00.000Z"
    });
  });

  it("validates age and deterministic list filters", () => {
    expect(
      customerListQuerySchema.parse({
        page: "2",
        pageSize: "10",
        search: "081 234",
        status: "all"
      })
    ).toEqual({
      page: 2,
      pageSize: 10,
      search: "081 234",
      status: "all"
    });

    expect(() =>
      createCustomerRequestSchema.parse({
        code: "C-001",
        firstName: "สมชาย",
        lastName: "ใจดี",
        age: 151,
        gender: "MALE",
        address: "",
        phone: "",
        joinedAt: "2026-06-15T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("validates customer and empty purchase-history responses", () => {
    const customer = customerResponseSchema.parse({
      id: customerId,
      code: "C-001",
      firstName: "สมชาย",
      lastName: "ใจดี",
      age: 35,
      gender: "MALE",
      address: "กรุงเทพฯ",
      phone: "081-234-5678",
      joinedAt: "2026-06-15T00:00:00.000Z",
      isActive: true,
      archivedAt: null,
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z"
    });

    expect(
      customerPurchaseHistoryResponseSchema.parse({
        customer,
        summary: {
          orderCount: 0,
          totalSales: "0.00",
          totalCost: "0.00",
          grossProfit: "0.00"
        },
        items: [],
        page: 1,
        pageSize: 25,
        total: 0
      })
    ).toEqual(expect.objectContaining({ total: 0 }));
  });
});
