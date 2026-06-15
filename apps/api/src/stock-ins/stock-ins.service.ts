import { createHash } from "node:crypto";

import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  CreateStockInRequest,
  PaginatedStockInsResponse,
  StockInListQuery,
  StockInResponse
} from "@warehouse/contracts";
import {
  Prisma,
  type TransactionClient,
  withSerializableTransaction
} from "@warehouse/database";

import { DatabaseService } from "../database/database.service";

const stockInInclude = {
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: [{ id: "asc" }],
    include: {
      product: { select: { id: true, code: true, name: true } },
      lot: {
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          availableQuantity: true
        }
      }
    }
  }
} satisfies Prisma.StockInInclude;

type StockInRecord = Prisma.StockInGetPayload<{
  include: typeof stockInInclude;
}>;

interface CreateStockInContext {
  idempotencyKey: string;
  actorId: string;
  requestId?: string | undefined;
}

function mapStockIn(stockIn: StockInRecord): StockInResponse {
  return {
    id: stockIn.id,
    referenceNumber: stockIn.referenceNumber,
    warehouse: stockIn.warehouse,
    receivedAt: stockIn.receivedAt.toISOString(),
    createdBy: stockIn.createdBy,
    createdAt: stockIn.createdAt.toISOString(),
    items: stockIn.items.map((item) => ({
      id: item.id,
      product: item.product,
      lotId: item.lot.id,
      lotNumber: item.lot.lotNumber,
      expiryDate: item.lot.expiryDate?.toISOString() ?? null,
      quantity: item.quantity,
      availableQuantity: item.lot.availableQuantity,
      unitCost: item.unitCost.toFixed(2)
    }))
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

@Injectable()
export class StockInsService {
  constructor(private readonly database: DatabaseService) {}

  requestHash(input: CreateStockInRequest): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }

  async create(
    input: CreateStockInRequest,
    context: CreateStockInContext
  ): Promise<StockInResponse> {
    const hash = this.requestHash(input);
    const existing = await this.database.client.stockIn.findUnique({
      where: { idempotencyKey: context.idempotencyKey },
      include: stockInInclude
    });
    if (existing) {
      return this.resolveIdempotent(existing, hash);
    }

    try {
      const created = await withSerializableTransaction(
        this.database.client,
        async (transaction) =>
          this.createInTransaction(transaction, input, context, hash)
      );
      return mapStockIn(created);
    } catch (error) {
      if (hasPrismaCode(error, "P2002")) {
        const retry = await this.database.client.stockIn.findUnique({
          where: { idempotencyKey: context.idempotencyKey },
          include: stockInInclude
        });
        if (retry) {
          return this.resolveIdempotent(retry, hash);
        }
        throw new ConflictException({
          code: "STOCK_IN_CONFLICT",
          message: "เลขที่อ้างอิงหรือ LOT ถูกใช้งานแล้ว"
        });
      }
      throw error;
    }
  }

  async list(query: StockInListQuery): Promise<PaginatedStockInsResponse> {
    const [items, total] = await Promise.all([
      this.database.client.stockIn.findMany({
        include: stockInInclude,
        orderBy: [
          { receivedAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" }
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.stockIn.count()
    ]);
    return {
      items: items.map(mapStockIn),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async get(id: string): Promise<StockInResponse> {
    const stockIn = await this.database.client.stockIn.findUnique({
      where: { id },
      include: stockInInclude
    });
    if (!stockIn) {
      throw new NotFoundException({
        code: "STOCK_IN_NOT_FOUND",
        message: "ไม่พบรายการรับสินค้า"
      });
    }
    return mapStockIn(stockIn);
  }

  private async createInTransaction(
    transaction: TransactionClient,
    input: CreateStockInRequest,
    context: CreateStockInContext,
    requestHash: string
  ): Promise<StockInRecord> {
    const existing = await transaction.stockIn.findUnique({
      where: { idempotencyKey: context.idempotencyKey },
      include: stockInInclude
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw this.idempotencyConflict();
      }
      return existing;
    }

    const warehouse = input.warehouseId
      ? await transaction.warehouse.findFirst({
          where: { id: input.warehouseId, isActive: true },
          select: { id: true }
        })
      : await transaction.warehouse.findFirst({
          where: { isDefault: true, isActive: true },
          orderBy: [{ code: "asc" }, { id: "asc" }],
          select: { id: true }
        });
    if (!warehouse) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "ไม่พบคลังสินค้าที่ใช้งาน"
      });
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await transaction.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true }
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "พบสินค้าที่ไม่มีอยู่หรือไม่ได้ใช้งาน"
      });
    }

    const stockIn = await transaction.stockIn.create({
      data: {
        referenceNumber: input.referenceNumber,
        warehouseId: warehouse.id,
        receivedAt: new Date(input.receivedAt),
        idempotencyKey: context.idempotencyKey,
        requestHash,
        createdById: context.actorId,
        ...(context.requestId ? { requestId: context.requestId } : {})
      }
    });

    for (const item of input.items) {
      const lot = await transaction.lot.create({
        data: {
          productId: item.productId,
          warehouseId: warehouse.id,
          lotNumber: item.lotNumber,
          receivedAt: new Date(input.receivedAt),
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          unitCost: new Prisma.Decimal(item.unitCost),
          receivedQuantity: item.quantity,
          availableQuantity: item.quantity
        }
      });
      await transaction.stockInItem.create({
        data: {
          stockInId: stockIn.id,
          productId: item.productId,
          lotId: lot.id,
          quantity: item.quantity,
          unitCost: new Prisma.Decimal(item.unitCost)
        }
      });
      await transaction.inventoryMovement.create({
        data: {
          type: "STOCK_IN",
          quantityDelta: item.quantity,
          lotId: lot.id,
          warehouseId: warehouse.id,
          actorId: context.actorId,
          occurredAt: new Date(input.receivedAt),
          referenceType: "STOCK_IN",
          referenceId: stockIn.id,
          ...(context.requestId ? { requestId: context.requestId } : {})
        }
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: context.actorId,
        action: "STOCK_IN_CREATED",
        resourceType: "STOCK_IN",
        resourceId: stockIn.id,
        ...(context.requestId ? { requestId: context.requestId } : {}),
        after: {
          referenceNumber: input.referenceNumber,
          warehouseId: warehouse.id,
          receivedAt: new Date(input.receivedAt).toISOString(),
          itemCount: input.items.length
        }
      }
    });

    return transaction.stockIn.findUniqueOrThrow({
      where: { id: stockIn.id },
      include: stockInInclude
    });
  }

  private resolveIdempotent(
    existing: StockInRecord,
    requestHash: string
  ): StockInResponse {
    if (existing.requestHash !== requestHash) {
      throw this.idempotencyConflict();
    }
    return mapStockIn(existing);
  }

  private idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Idempotency-Key นี้ถูกใช้กับข้อมูลอื่นแล้ว"
    });
  }
}
