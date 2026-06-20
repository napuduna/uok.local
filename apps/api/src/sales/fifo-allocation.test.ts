import { describe, expect, it } from "vitest";

import {
  allocateFifo,
  type FifoLotCandidate,
  type InsufficientStockError
} from "./fifo-allocation";

const asOf = new Date("2026-06-15T00:00:00.000Z");

function lot(
  overrides: Partial<FifoLotCandidate> & Pick<FifoLotCandidate, "id">
): FifoLotCandidate {
  return {
    id: overrides.id,
    lotNumber: overrides.lotNumber ?? overrides.id,
    availableQuantity: overrides.availableQuantity ?? 100,
    unitCost: overrides.unitCost ?? "20.00",
    receivedAt: overrides.receivedAt ?? "2026-01-01T00:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    expiryDate: overrides.expiryDate ?? null,
    isActive: overrides.isActive ?? true
  };
}

describe("allocateFifo", () => {
  it("allocates the standard 500-unit fixture and snapshots cost", () => {
    const result = allocateFifo(
      [
        lot({
          id: "LOT001",
          availableQuantity: 300,
          unitCost: "20.00",
          receivedAt: "2026-01-01T00:00:00.000Z"
        }),
        lot({
          id: "LOT002",
          availableQuantity: 1100,
          unitCost: "22.00",
          receivedAt: "2026-02-01T00:00:00.000Z"
        })
      ],
      500,
      asOf
    );

    expect(result).toEqual({
      requestedQuantity: 500,
      totalCost: "10400.00",
      allocations: [
        {
          lotId: "LOT001",
          lotNumber: "LOT001",
          quantity: 300,
          unitCost: "20.00",
          costSubtotal: "6000.00"
        },
        {
          lotId: "LOT002",
          lotNumber: "LOT002",
          quantity: 200,
          unitCost: "22.00",
          costSubtotal: "4400.00"
        }
      ]
    });
  });

  it("excludes expired, archived and empty lots", () => {
    const result = allocateFifo(
      [
        lot({
          id: "EXPIRED",
          availableQuantity: 100,
          expiryDate: "2026-06-14T00:00:00.000Z"
        }),
        lot({ id: "ARCHIVED", availableQuantity: 100, isActive: false }),
        lot({ id: "EMPTY", availableQuantity: 0 }),
        lot({
          id: "VALID",
          availableQuantity: 100,
          expiryDate: "2026-06-16T00:00:00.000Z"
        })
      ],
      50,
      asOf
    );

    expect(result.allocations.map((allocation) => allocation.lotId)).toEqual([
      "VALID"
    ]);
  });

  it("uses receivedAt, createdAt and id for deterministic ordering", () => {
    const result = allocateFifo(
      [
        lot({
          id: "C",
          availableQuantity: 10,
          receivedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-02T00:00:00.000Z"
        }),
        lot({
          id: "B",
          availableQuantity: 10,
          receivedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z"
        }),
        lot({
          id: "A",
          availableQuantity: 10,
          receivedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z"
        })
      ],
      25,
      asOf
    );

    expect(result.allocations.map((allocation) => allocation.lotId)).toEqual([
      "A",
      "B",
      "C"
    ]);
    expect(result.allocations.map((allocation) => allocation.quantity)).toEqual(
      [10, 10, 5]
    );
  });

  it("returns an insufficient-stock domain error without allocations", () => {
    expect(() =>
      allocateFifo(
        [lot({ id: "LOT001", availableQuantity: 10 })],
        11,
        asOf
      )
    ).toThrow(
      expect.objectContaining<Partial<InsufficientStockError>>({
        code: "INSUFFICIENT_STOCK",
        requestedQuantity: 11,
        availableQuantity: 10
      })
    );
  });
});
