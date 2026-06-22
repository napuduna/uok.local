import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../database/database.service";
import { StockInsService } from "./stock-ins.service";

const input = {
  referenceNumber: "SI-001",
  receivedAt: "2026-06-15T00:00:00.000Z",
  items: [
    {
      productId: "ac1d9514-b32e-4d03-865b-b46353705fe8",
      lotNumber: "LOT001",
      expiryDate: null,
      quantity: 300,
      unitCost: "20.00"
    }
  ]
};

const record = {
  id: "50d3c1a7-ae0d-4e82-8257-62297a32d48f",
  referenceNumber: "SI-001",
  warehouse: {
    id: "880f2aa8-d669-482f-93bc-cf986cad81ac",
    code: "MAIN",
    name: "คลังหลัก"
  },
  receivedAt: new Date("2026-06-15T00:00:00.000Z"),
  createdBy: {
    id: "cf4dbeb7-bbf5-4190-adf2-2f0ebd037e88",
    name: "Admin"
  },
  createdAt: new Date("2026-06-15T01:00:00.000Z"),
  requestHash: "same-hash",
  items: [
    {
      id: "d646b2b5-c269-40f7-8af7-40d48ea08459",
      quantity: 300,
      unitCost: { toFixed: () => "20.00" },
      product: {
        id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
        code: "P001",
        name: "สินค้า"
      },
      lot: {
        id: "af09fcdf-00ec-4cd8-bd60-87b714bfc1d8",
        lotNumber: "LOT001",
        expiryDate: null,
        availableQuantity: 300
      }
    }
  ]
};

describe("StockInsService", () => {
  it("returns the original receipt for an identical idempotent retry", async () => {
    const database = {
      client: {
        stockIn: {
          findUnique: vi.fn().mockResolvedValue(record)
        }
      }
    } as unknown as DatabaseService;
    const service = new StockInsService(database);
    vi.spyOn(service, "requestHash").mockReturnValue("same-hash");

    await expect(
      service.create(input, {
        idempotencyKey: "stock-in-key",
        actorId: record.createdBy.id
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: record.id,
        referenceNumber: "SI-001"
      })
    );
  });

  it("rejects reuse of an idempotency key with a different payload", async () => {
    const database = {
      client: {
        stockIn: {
          findUnique: vi.fn().mockResolvedValue(record)
        }
      }
    } as unknown as DatabaseService;
    const service = new StockInsService(database);
    vi.spyOn(service, "requestHash").mockReturnValue("different-hash");

    await expect(
      service.create(input, {
        idempotencyKey: "stock-in-key",
        actorId: record.createdBy.id
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
