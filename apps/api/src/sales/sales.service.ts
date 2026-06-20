import { createHash } from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  Role,
  type CancelSaleRequest,
  type CreateSaleRequest,
  type PaginatedSaleCatalogResponse,
  type PaginatedSalesResponse,
  type RoleValue,
  type SaleCatalogQuery,
  type SaleListQuery,
  type SaleResponse
} from "@warehouse/contracts";
import {
  lockRowsForUpdate,
  Prisma,
  type TransactionClient,
  withSerializableTransaction
} from "@warehouse/database";

import { DatabaseService } from "../database/database.service";
import {
  allocateFifo,
  InsufficientStockError,
  type FifoAllocationResult
} from "./fifo-allocation";

const saleInclude = {
  customer: {
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true
    }
  },
  warehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    orderBy: [{ id: "asc" }],
    include: {
      product: { select: { id: true, code: true, name: true } },
      allocations: {
        include: {
          lot: {
            select: {
              id: true,
              lotNumber: true,
              receivedAt: true,
              createdAt: true
            }
          }
        }
      }
    }
  }
} satisfies Prisma.SaleInclude;

type SaleRecord = Prisma.SaleGetPayload<{ include: typeof saleInclude }>;

interface LockedLotRow {
  id: string;
  lotNumber: string;
  availableQuantity: number;
  unitCost: string;
  receivedAt: Date;
  createdAt: Date;
  expiryDate: Date | null;
  isActive: boolean;
}

interface CreateSaleContext {
  idempotencyKey: string;
  actorId: string;
  requestId?: string | undefined;
}

interface SaleReadContext {
  actorId: string;
  role: RoleValue;
}

interface CancelSaleContext extends SaleReadContext {
  idempotencyKey: string;
  requestId?: string | undefined;
}

function mapSale(sale: SaleRecord): SaleResponse {
  const items = [...sale.items].sort(
    (left, right) =>
      left.product.code.localeCompare(right.product.code) ||
      left.id.localeCompare(right.id)
  );

  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    status: sale.status,
    soldAt: sale.soldAt.toISOString(),
    customer: sale.customer,
    warehouse: sale.warehouse,
    createdBy: sale.createdBy,
    totalSales: sale.totalSales.toFixed(2),
    totalCost: sale.totalCost.toFixed(2),
    grossProfit: sale.grossProfit.toFixed(2),
    cancellationReason: sale.cancellationReason,
    cancelledAt: sale.cancelledAt?.toISOString() ?? null,
    createdAt: sale.createdAt.toISOString(),
    items: items.map((item) => ({
      id: item.id,
      product: item.product,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      salesSubtotal: item.salesSubtotal.toFixed(2),
      costSubtotal: item.costSubtotal.toFixed(2),
      grossProfit: item.grossProfit.toFixed(2),
      allocations: [...item.allocations]
        .sort(
          (left, right) =>
            left.lot.receivedAt.getTime() - right.lot.receivedAt.getTime() ||
            left.lot.createdAt.getTime() - right.lot.createdAt.getTime() ||
            left.lot.id.localeCompare(right.lot.id)
        )
        .map((allocation) => ({
          id: allocation.id,
          lotId: allocation.lot.id,
          lotNumber: allocation.lot.lotNumber,
          quantity: allocation.quantity,
          unitCost: allocation.unitCost.toFixed(2),
          costSubtotal: allocation.costSubtotal.toFixed(2)
        }))
    }))
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

function thaiDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(value)
    .replaceAll("-", "");
}

@Injectable()
export class SalesService {
  constructor(private readonly database: DatabaseService) {}

  async catalog(
    query: SaleCatalogQuery
  ): Promise<PaginatedSaleCatalogResponse> {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [warehouse, products, total] = await Promise.all([
      this.database.client.warehouse.findFirst({
        where: { isDefault: true, isActive: true },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        select: { id: true }
      }),
      this.database.client.product.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          salePrice: true,
          unit: { select: { code: true, name: true } }
        },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.product.count({ where })
    ]);
    if (!warehouse) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "ไม่พบคลังสินค้าที่ใช้งาน"
      });
    }

    const productIds = products.map((product) => product.id);
    const stock = productIds.length
      ? await this.database.client.lot.groupBy({
          by: ["productId"],
          where: {
            productId: { in: productIds },
            warehouseId: warehouse.id,
            isActive: true,
            availableQuantity: { gt: 0 },
            OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }]
          },
          _sum: { availableQuantity: true }
        })
      : [];
    const stockByProduct = new Map(
      stock.map((item) => [
        item.productId,
        item._sum.availableQuantity ?? 0
      ])
    );

    return {
      items: products.map((product) => ({
        product: {
          id: product.id,
          code: product.code,
          name: product.name
        },
        unit: product.unit,
        salePrice: product.salePrice.toFixed(2),
        totalAvailable: stockByProduct.get(product.id) ?? 0
      })),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  requestHash(input: unknown): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }

  async create(
    input: CreateSaleRequest,
    context: CreateSaleContext
  ): Promise<SaleResponse> {
    const requestHash = this.requestHash(input);
    const existing = await this.database.client.sale.findUnique({
      where: { idempotencyKey: context.idempotencyKey },
      include: saleInclude
    });
    if (existing) {
      return this.resolveIdempotent(existing, requestHash);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const sale = await withSerializableTransaction(
          this.database.client,
          async (transaction) =>
            this.createInTransaction(
              transaction,
              input,
              context,
              requestHash
            )
        );
        return mapSale(sale);
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          throw new ConflictException({
            code: error.code,
            message: "จำนวนสินค้าคงเหลือไม่เพียงพอ",
            details: {
              requestedQuantity: error.requestedQuantity,
              availableQuantity: error.availableQuantity
            }
          });
        }
        if (hasErrorCode(error, "P2002")) {
          const retry = await this.database.client.sale.findUnique({
            where: { idempotencyKey: context.idempotencyKey },
            include: saleInclude
          });
          if (retry) {
            return this.resolveIdempotent(retry, requestHash);
          }
          throw new ConflictException({
            code: "SALE_CONFLICT",
            message: "ไม่สามารถสร้างรายการขายซ้ำได้"
          });
        }
        if (
          (hasErrorCode(error, "P2034") || hasErrorCode(error, "40001")) &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      code: "SALE_CONFLICT",
      message: "ไม่สามารถสร้างรายการขายได้เนื่องจากมีรายการพร้อมกัน"
    });
  }

  async cancel(
    saleId: string,
    input: CancelSaleRequest,
    context: CancelSaleContext
  ): Promise<SaleResponse> {
    const requestHash = this.requestHash(input);
    const existing = await this.database.client.sale.findUnique({
      where: { cancellationIdempotencyKey: context.idempotencyKey },
      include: saleInclude
    });
    if (existing) {
      return this.resolveCancellationIdempotent(
        existing,
        saleId,
        requestHash
      );
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const sale = await withSerializableTransaction(
          this.database.client,
          async (transaction) =>
            this.cancelInTransaction(
              transaction,
              saleId,
              input,
              context,
              requestHash
            )
        );
        return mapSale(sale);
      } catch (error) {
        if (hasErrorCode(error, "P2002")) {
          const retry = await this.database.client.sale.findUnique({
            where: { cancellationIdempotencyKey: context.idempotencyKey },
            include: saleInclude
          });
          if (retry) {
            return this.resolveCancellationIdempotent(
              retry,
              saleId,
              requestHash
            );
          }
        }
        if (
          (hasErrorCode(error, "P2034") || hasErrorCode(error, "40001")) &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      code: "SALE_CANCELLATION_CONFLICT",
      message: "ไม่สามารถยกเลิกบิลได้เนื่องจากมีรายการพร้อมกัน"
    });
  }

  async list(
    query: SaleListQuery,
    context: SaleReadContext
  ): Promise<PaginatedSalesResponse> {
    const where = this.readWhere(context, {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.invoiceNumber
        ? {
            invoiceNumber: {
              contains: query.invoiceNumber,
              mode: "insensitive"
            }
          }
        : {}),
      ...(query.status === "completed"
        ? { status: "COMPLETED" }
        : query.status === "cancelled"
          ? { status: "CANCELLED" }
          : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            soldAt: {
              ...(query.dateFrom
                ? { gte: new Date(`${query.dateFrom}T00:00:00+07:00`) }
                : {}),
              ...(query.dateTo
                ? {
                    lt: new Date(
                      new Date(`${query.dateTo}T00:00:00+07:00`).getTime() +
                        24 * 60 * 60 * 1000
                    )
                  }
                : {})
            }
          }
        : {})
    });
    const [items, total] = await Promise.all([
      this.database.client.sale.findMany({
        where,
        include: saleInclude,
        orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.sale.count({ where })
    ]);
    return {
      items: items.map(mapSale),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async get(id: string, context: SaleReadContext): Promise<SaleResponse> {
    const sale = await this.database.client.sale.findFirst({
      where: this.readWhere(context, { id }),
      include: saleInclude
    });
    if (!sale) {
      throw this.notFound();
    }
    return mapSale(sale);
  }

  private async createInTransaction(
    transaction: TransactionClient,
    input: CreateSaleRequest,
    context: CreateSaleContext,
    requestHash: string
  ): Promise<SaleRecord> {
    const existing = await transaction.sale.findUnique({
      where: { idempotencyKey: context.idempotencyKey },
      include: saleInclude
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw this.idempotencyConflict();
      }
      return existing;
    }

    const customer = await transaction.customer.findFirst({
      where: { id: input.customerId, isActive: true },
      select: { id: true }
    });
    if (!customer) {
      throw new NotFoundException({
        code: "CUSTOMER_NOT_FOUND",
        message: "ไม่พบลูกค้าที่ใช้งาน"
      });
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

    const productIds = input.items
      .map((item) => item.productId)
      .sort((left, right) => left.localeCompare(right));
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

    const soldAt = new Date();
    const allocationByProduct = new Map<string, FifoAllocationResult>();
    for (const productId of productIds) {
      const item = input.items.find(
        (candidate) => candidate.productId === productId
      )!;
      const candidates = await lockRowsForUpdate<LockedLotRow>(
        transaction,
        Prisma.sql`
          SELECT
            "id",
            "lotNumber",
            "availableQuantity",
            "unitCost"::text AS "unitCost",
            "receivedAt",
            "createdAt",
            "expiryDate",
            "isActive"
          FROM "Lot"
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouse.id}
            AND "isActive" = true
            AND "availableQuantity" > 0
            AND ("expiryDate" IS NULL OR "expiryDate" > ${soldAt})
          ORDER BY "receivedAt" ASC, "createdAt" ASC, "id" ASC
        `
      );
      try {
        allocationByProduct.set(
          productId,
          allocateFifo(candidates, item.quantity, soldAt)
        );
      } catch (error) {
        if (error instanceof InsufficientStockError) {
          throw new ConflictException({
            code: error.code,
            message: "จำนวนสินค้าคงเหลือไม่เพียงพอ",
            details: {
              productId,
              requestedQuantity: error.requestedQuantity,
              availableQuantity: error.availableQuantity
            }
          });
        }
        throw error;
      }
    }

    const sequence = await transaction.$queryRaw<{ value: string }[]>`
      SELECT nextval('"sale_invoice_seq"')::text AS "value"
    `;
    const sequenceValue = sequence[0]?.value;
    if (!sequenceValue) {
      throw new Error("Could not generate invoice sequence");
    }
    const invoiceNumber = `INV-${thaiDateKey(soldAt)}-${sequenceValue.padStart(
      6,
      "0"
    )}`;

    let totalSales = new Prisma.Decimal(0);
    let totalCost = new Prisma.Decimal(0);
    const itemSnapshots = input.items.map((item) => {
      const allocation = allocationByProduct.get(item.productId)!;
      const salesSubtotal = new Prisma.Decimal(item.unitPrice).mul(
        item.quantity
      );
      const costSubtotal = new Prisma.Decimal(allocation.totalCost);
      totalSales = totalSales.add(salesSubtotal);
      totalCost = totalCost.add(costSubtotal);
      return { input: item, allocation, salesSubtotal, costSubtotal };
    });

    const sale = await transaction.sale.create({
      data: {
        invoiceNumber,
        customerId: customer.id,
        warehouseId: warehouse.id,
        status: "COMPLETED",
        soldAt,
        totalSales,
        totalCost,
        grossProfit: totalSales.sub(totalCost),
        idempotencyKey: context.idempotencyKey,
        requestHash,
        createdById: context.actorId,
        ...(context.requestId ? { requestId: context.requestId } : {})
      }
    });

    for (const snapshot of itemSnapshots) {
      const saleItem = await transaction.saleItem.create({
        data: {
          saleId: sale.id,
          productId: snapshot.input.productId,
          quantity: snapshot.input.quantity,
          unitPrice: new Prisma.Decimal(snapshot.input.unitPrice),
          salesSubtotal: snapshot.salesSubtotal,
          costSubtotal: snapshot.costSubtotal,
          grossProfit: snapshot.salesSubtotal.sub(snapshot.costSubtotal)
        }
      });
      for (const allocation of snapshot.allocation.allocations) {
        await transaction.saleAllocation.create({
          data: {
            saleItemId: saleItem.id,
            lotId: allocation.lotId,
            quantity: allocation.quantity,
            unitCost: new Prisma.Decimal(allocation.unitCost),
            costSubtotal: new Prisma.Decimal(allocation.costSubtotal)
          }
        });
        await transaction.lot.update({
          where: { id: allocation.lotId },
          data: {
            availableQuantity: { decrement: allocation.quantity }
          }
        });
        await transaction.inventoryMovement.create({
          data: {
            type: "SALE_OUT",
            quantityDelta: -allocation.quantity,
            lotId: allocation.lotId,
            warehouseId: warehouse.id,
            actorId: context.actorId,
            occurredAt: soldAt,
            referenceType: "SALE",
            referenceId: sale.id,
            ...(context.requestId ? { requestId: context.requestId } : {})
          }
        });
      }
    }

    await transaction.auditLog.create({
      data: {
        actorId: context.actorId,
        action: "SALE_CREATED",
        resourceType: "SALE",
        resourceId: sale.id,
        ...(context.requestId ? { requestId: context.requestId } : {}),
        after: {
          invoiceNumber,
          customerId: customer.id,
          warehouseId: warehouse.id,
          totalSales: totalSales.toFixed(2),
          totalCost: totalCost.toFixed(2),
          grossProfit: totalSales.sub(totalCost).toFixed(2),
          itemCount: input.items.length
        }
      }
    });

    return transaction.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: saleInclude
    });
  }

  private async cancelInTransaction(
    transaction: TransactionClient,
    saleId: string,
    input: CancelSaleRequest,
    context: CancelSaleContext,
    requestHash: string
  ): Promise<SaleRecord> {
    const existing = await transaction.sale.findUnique({
      where: { cancellationIdempotencyKey: context.idempotencyKey },
      include: saleInclude
    });
    if (existing) {
      if (
        existing.id !== saleId ||
        existing.cancellationRequestHash !== requestHash
      ) {
        throw this.idempotencyConflict();
      }
      return existing;
    }

    const lockedSale = await lockRowsForUpdate<{ id: string }>(
      transaction,
      Prisma.sql`SELECT "id" FROM "Sale" WHERE "id" = ${saleId}`
    );
    if (lockedSale.length === 0) {
      throw this.notFound();
    }
    const sale = await transaction.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: saleInclude
    });
    if (context.role === Role.SALES && sale.createdById !== context.actorId) {
      throw this.notFound();
    }
    if (sale.status !== "COMPLETED") {
      throw new ConflictException({
        code: "SALE_ALREADY_CANCELLED",
        message: "บิลนี้ถูกยกเลิกแล้ว"
      });
    }

    const allocations = sale.items
      .flatMap((item) => item.allocations)
      .sort(
        (left, right) =>
          left.lot.id.localeCompare(right.lot.id) ||
          left.id.localeCompare(right.id)
      );
    const lotIds = [...new Set(allocations.map((item) => item.lot.id))].sort(
      (left, right) => left.localeCompare(right)
    );
    if (lotIds.length > 0) {
      await lockRowsForUpdate<{ id: string }>(
        transaction,
        Prisma.sql`
          SELECT "id"
          FROM "Lot"
          WHERE "id" IN (${Prisma.join(lotIds)})
          ORDER BY "id" ASC
        `
      );
    }

    const cancelledAt = new Date();
    for (const allocation of allocations) {
      await transaction.lot.update({
        where: { id: allocation.lot.id },
        data: {
          availableQuantity: { increment: allocation.quantity }
        }
      });
      await transaction.inventoryMovement.create({
        data: {
          type: "SALE_CANCELLATION_IN",
          quantityDelta: allocation.quantity,
          lotId: allocation.lot.id,
          warehouseId: sale.warehouseId,
          actorId: context.actorId,
          occurredAt: cancelledAt,
          referenceType: "SALE",
          referenceId: sale.id,
          reason: input.reason,
          ...(context.requestId ? { requestId: context.requestId } : {})
        }
      });
    }

    await transaction.sale.update({
      where: { id: sale.id },
      data: {
        status: "CANCELLED",
        cancelledAt,
        cancellationReason: input.reason,
        cancellationIdempotencyKey: context.idempotencyKey,
        cancellationRequestHash: requestHash,
        cancelledById: context.actorId
      }
    });
    await transaction.auditLog.create({
      data: {
        actorId: context.actorId,
        action: "SALE_CANCELLED",
        resourceType: "SALE",
        resourceId: sale.id,
        ...(context.requestId ? { requestId: context.requestId } : {}),
        before: { status: "COMPLETED" },
        after: {
          status: "CANCELLED",
          reason: input.reason,
          restoredQuantity: allocations.reduce(
            (total, allocation) => total + allocation.quantity,
            0
          ),
          allocationCount: allocations.length
        }
      }
    });

    return transaction.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: saleInclude
    });
  }

  private readWhere(
    context: SaleReadContext,
    where: Prisma.SaleWhereInput
  ): Prisma.SaleWhereInput {
    if (context.role === Role.SALES) {
      return { AND: [where, { createdById: context.actorId }] };
    }
    if (context.role !== Role.ADMIN && context.role !== Role.MANAGER) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "คุณไม่มีสิทธิ์ดูรายการขาย"
      });
    }
    return where;
  }

  private resolveIdempotent(
    sale: SaleRecord,
    requestHash: string
  ): SaleResponse {
    if (sale.requestHash !== requestHash) {
      throw this.idempotencyConflict();
    }
    return mapSale(sale);
  }

  private resolveCancellationIdempotent(
    sale: SaleRecord,
    saleId: string,
    requestHash: string
  ): SaleResponse {
    if (
      sale.id !== saleId ||
      sale.cancellationRequestHash !== requestHash
    ) {
      throw this.idempotencyConflict();
    }
    return mapSale(sale);
  }

  private idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Idempotency-Key นี้ถูกใช้กับข้อมูลอื่นแล้ว"
    });
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "SALE_NOT_FOUND",
      message: "ไม่พบรายการขาย"
    });
  }
}
