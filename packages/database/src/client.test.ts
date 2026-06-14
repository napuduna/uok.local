import { describe, expect, it, vi } from "vitest";

import { Prisma } from "./generated/client/client.js";
import { lockRowsForUpdate, withSerializableTransaction } from "./client.js";

describe("database transaction helpers", () => {
  it("uses serializable isolation for stock-changing operations", async () => {
    const operation = vi.fn().mockResolvedValue("done");
    const transaction = vi.fn().mockResolvedValue("done");
    const client = { $transaction: transaction } as never;

    await expect(withSerializableTransaction(client, operation)).resolves.toBe(
      "done"
    );
    expect(transaction).toHaveBeenCalledWith(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  });

  it("appends FOR UPDATE to a parameterized row-lock query", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: "lot-1" }]);
    const transaction = { $queryRaw: queryRaw } as never;

    await expect(
      lockRowsForUpdate<{ id: string }>(
        transaction,
        Prisma.sql`SELECT "id" FROM "Lot" WHERE "productId" = ${"product-1"}`
      )
    ).resolves.toEqual([{ id: "lot-1" }]);
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(JSON.stringify(queryRaw.mock.calls[0]?.[0])).toContain(
      " FOR UPDATE"
    );
  });
});
