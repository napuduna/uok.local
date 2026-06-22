import { createHash } from "node:crypto";

import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  CreateInventoryAdjustmentRequest,
  InventoryAdjustmentListQuery,
  InventoryAdjustmentResponse,
  PaginatedInventoryAdjustmentsResponse
} from "@warehouse/contracts";
import {
  lockRowsForUpdate,
  Prisma,
  type TransactionClient,
  withSerializableTransaction
} from "@warehouse/database";

import { DatabaseService } from "../database/database.service";

const adjustmentInclude = {
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  lot: {
    select: {
      id: true,
      lotNumber: true,
      product: { select: { id: true, code: true, name: true } }
    }
  }
} satisfies Prisma.InventoryAdjustmentInclude;

type AdjustmentRecord = Prisma.InventoryAdjustmentGetPayload<{
  include: typeof adjustmentInclude;
}>;

interface LockedLot {
  id: string;
  warehouseId: string;
  availableQuantity: number;
  isActive: boolean;
}

interface CreateAdjustmentContext {
  idempotencyKey: string;
  actorId: string;
  requestId?: string | undefined;
}

function mapAdjustment(
  adjustment: AdjustmentRecord
): InventoryAdjustmentResponse {
  return {
    id: adjustment.id,
    referenceNumber: adjustment.referenceNumber,
    direction: adjustment.direction,
    quantity: adjustment.quantity,
    quantityDelta: adjustment.quantityDelta,
    reason: adjustment.reason,
    product: adjustment.lot.product,
    lot: {
      id: adjustment.lot.id,
      lotNumber: adjustment.lot.lotNumber
    },
    warehouse: adjustment.warehouse,
    beforeQuantity: adjustment.beforeQuantity,
    afterQuantity: adjustment.afterQuantity,
    createdBy: adjustment.createdBy,
    createdAt: adjustment.createdAt.toISOString()
  };
}

function hasErrorCode(
  error: unknown,
  expectedCode: string,
  seen = new Set<object>()
): boolean {
  if (typeof error !== "object" || error === null || seen.has(error)) {
    return false;
  }
  seen.add(error);

  if (
    ("code" in error && error.code === expectedCode) ||
    ("originalCode" in error && error.originalCode === expectedCode)
  ) {
    return true;
  }

  return Object.values(error).some((value) =>
    hasErrorCode(value, expectedCode, seen)
  );
}

@Injectable()
export class AdjustmentsService {
  constructor(private readonly database: DatabaseService) {}

  requestHash(input: CreateInventoryAdjustmentRequest): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }

  async create(
    input: CreateInventoryAdjustmentRequest,
    context: CreateAdjustmentContext
  ): Promise<InventoryAdjustmentResponse> {
    const requestHash = this.requestHash(input);
    const existing =
      await this.database.client.inventoryAdjustment.findUnique({
        where: { idempotencyKey: context.idempotencyKey },
        include: adjustmentInclude
      });
    if (existing) {
      return this.resolveIdempotent(existing, requestHash);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const created = await withSerializableTransaction(
          this.database.client,
          async (transaction) =>
            this.createInTransaction(
              transaction,
              input,
              context,
              requestHash
            )
        );
        return mapAdjustment(created);
      } catch (error) {
        if (hasErrorCode(error, "P2002")) {
          const retry =
            await this.database.client.inventoryAdjustment.findUnique({
              where: { idempotencyKey: context.idempotencyKey },
              include: adjustmentInclude
            });
          if (retry) {
            return this.resolveIdempotent(retry, requestHash);
          }
          throw new ConflictException({
            code: "ADJUSTMENT_CONFLICT",
            message: "เลขที่อ้างอิงถูกใช้งานแล้ว"
          });
        }
        if (
          (hasErrorCode(error, "P2034") ||
            hasErrorCode(error, "40001")) &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      code: "ADJUSTMENT_CONFLICT",
      message: "ไม่สามารถปรับสต๊อกได้เนื่องจากมีรายการพร้อมกัน"
    });
  }

  async list(
    query: InventoryAdjustmentListQuery
  ): Promise<PaginatedInventoryAdjustmentsResponse> {
    const [items, total] = await Promise.all([
      this.database.client.inventoryAdjustment.findMany({
        include: adjustmentInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.inventoryAdjustment.count()
    ]);

    return {
      items: items.map(mapAdjustment),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async get(id: string): Promise<InventoryAdjustmentResponse> {
    const adjustment =
      await this.database.client.inventoryAdjustment.findUnique({
        where: { id },
        include: adjustmentInclude
      });
    if (!adjustment) {
      throw new NotFoundException({
        code: "ADJUSTMENT_NOT_FOUND",
        message: "ไม่พบรายการปรับสต๊อก"
      });
    }
    return mapAdjustment(adjustment);
  }

  private async createInTransaction(
    transaction: TransactionClient,
    input: CreateInventoryAdjustmentRequest,
    context: CreateAdjustmentContext,
    requestHash: string
  ): Promise<AdjustmentRecord> {
    const existing = await transaction.inventoryAdjustment.findUnique({
      where: { idempotencyKey: context.idempotencyKey },
      include: adjustmentInclude
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw this.idempotencyConflict();
      }
      return existing;
    }

    const [lot] = await lockRowsForUpdate<LockedLot>(
      transaction,
      Prisma.sql`
        SELECT "id", "warehouseId", "availableQuantity", "isActive"
        FROM "Lot"
        WHERE "id" = ${input.lotId}
      `
    );
    if (!lot || !lot.isActive) {
      throw new NotFoundException({
        code: "LOT_NOT_FOUND",
        message: "ไม่พบ LOT ที่ใช้งานได้"
      });
    }

    const quantityDelta =
      input.direction === "INCREASE" ? input.quantity : -input.quantity;
    const beforeQuantity = lot.availableQuantity;
    const afterQuantity = beforeQuantity + quantityDelta;
    if (afterQuantity < 0) {
      throw new ConflictException({
        code: "INSUFFICIENT_STOCK",
        message: "จำนวนสินค้าคงเหลือไม่เพียงพอ",
        details: {
          lotId: lot.id,
          availableQuantity: beforeQuantity,
          requestedQuantity: input.quantity
        }
      });
    }

    const adjustment = await transaction.inventoryAdjustment.create({
      data: {
        referenceNumber: input.referenceNumber,
        warehouseId: lot.warehouseId,
        lotId: lot.id,
        direction: input.direction,
        quantity: input.quantity,
        quantityDelta,
        reason: input.reason,
        beforeQuantity,
        afterQuantity,
        idempotencyKey: context.idempotencyKey,
        requestHash,
        createdById: context.actorId,
        ...(context.requestId ? { requestId: context.requestId } : {})
      }
    });

    await transaction.lot.update({
      where: { id: lot.id },
      data: { availableQuantity: afterQuantity }
    });
    await transaction.inventoryMovement.create({
      data: {
        type:
          input.direction === "INCREASE"
            ? "ADJUSTMENT_IN"
            : "ADJUSTMENT_OUT",
        quantityDelta,
        lotId: lot.id,
        warehouseId: lot.warehouseId,
        actorId: context.actorId,
        referenceType: "INVENTORY_ADJUSTMENT",
        referenceId: adjustment.id,
        reason: input.reason,
        ...(context.requestId ? { requestId: context.requestId } : {})
      }
    });
    await transaction.auditLog.create({
      data: {
        actorId: context.actorId,
        action: "INVENTORY_ADJUSTED",
        resourceType: "INVENTORY_ADJUSTMENT",
        resourceId: adjustment.id,
        ...(context.requestId ? { requestId: context.requestId } : {}),
        before: {
          lotId: lot.id,
          availableQuantity: beforeQuantity
        },
        after: {
          referenceNumber: input.referenceNumber,
          lotId: lot.id,
          direction: input.direction,
          quantity: input.quantity,
          quantityDelta,
          availableQuantity: afterQuantity,
          reason: input.reason
        }
      }
    });

    return transaction.inventoryAdjustment.findUniqueOrThrow({
      where: { id: adjustment.id },
      include: adjustmentInclude
    });
  }

  private resolveIdempotent(
    adjustment: AdjustmentRecord,
    requestHash: string
  ): InventoryAdjustmentResponse {
    if (adjustment.requestHash !== requestHash) {
      throw this.idempotencyConflict();
    }
    return mapAdjustment(adjustment);
  }

  private idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Idempotency-Key นี้ถูกใช้กับข้อมูลอื่นแล้ว"
    });
  }
}
