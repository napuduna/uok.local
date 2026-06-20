export interface FifoLotCandidate {
  id: string;
  lotNumber: string;
  availableQuantity: number;
  unitCost: string;
  receivedAt: string | Date;
  createdAt: string | Date;
  expiryDate: string | Date | null;
  isActive: boolean;
}

export interface FifoAllocation {
  lotId: string;
  lotNumber: string;
  quantity: number;
  unitCost: string;
  costSubtotal: string;
}

export interface FifoAllocationResult {
  requestedQuantity: number;
  totalCost: string;
  allocations: FifoAllocation[];
}

export class InsufficientStockError extends Error {
  readonly code = "INSUFFICIENT_STOCK";

  constructor(
    readonly requestedQuantity: number,
    readonly availableQuantity: number
  ) {
    super("Insufficient stock for FIFO allocation");
    this.name = "InsufficientStockError";
  }
}

function timestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function parseMoneyToCents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new RangeError(`Invalid money value: ${value}`);
  }
  const whole = BigInt(match[1] ?? "0");
  const decimal = BigInt((match[2] ?? "").padEnd(2, "0"));
  return whole * 100n + decimal;
}

function formatCents(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n)
    .toString()
    .padStart(2, "0")}`;
}

export function allocateFifo(
  candidates: readonly FifoLotCandidate[],
  requestedQuantity: number,
  asOf: Date
): FifoAllocationResult {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new RangeError("Requested quantity must be a positive integer");
  }

  const eligible = candidates
    .filter(
      (candidate) =>
        candidate.isActive &&
        candidate.availableQuantity > 0 &&
        (candidate.expiryDate === null ||
          timestamp(candidate.expiryDate) > asOf.getTime())
    )
    .sort(
      (left, right) =>
        timestamp(left.receivedAt) - timestamp(right.receivedAt) ||
        timestamp(left.createdAt) - timestamp(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
  const availableQuantity = eligible.reduce(
    (total, candidate) => total + candidate.availableQuantity,
    0
  );
  if (availableQuantity < requestedQuantity) {
    throw new InsufficientStockError(requestedQuantity, availableQuantity);
  }

  let remaining = requestedQuantity;
  let totalCostCents = 0n;
  const allocations: FifoAllocation[] = [];

  for (const candidate of eligible) {
    if (remaining === 0) {
      break;
    }
    const quantity = Math.min(remaining, candidate.availableQuantity);
    const unitCostCents = parseMoneyToCents(candidate.unitCost);
    const costSubtotalCents = unitCostCents * BigInt(quantity);
    allocations.push({
      lotId: candidate.id,
      lotNumber: candidate.lotNumber,
      quantity,
      unitCost: formatCents(unitCostCents),
      costSubtotal: formatCents(costSubtotalCents)
    });
    totalCostCents += costSubtotalCents;
    remaining -= quantity;
  }

  return {
    requestedQuantity,
    totalCost: formatCents(totalCostCents),
    allocations
  };
}
