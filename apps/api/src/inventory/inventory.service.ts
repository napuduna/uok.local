import { Injectable, NotFoundException } from "@nestjs/common";

import type {
  LotListQuery,
  LotResponse,
  PaginatedLotsResponse,
  ReconciliationResponse,
  StockSummaryResponse
} from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";

const lotInclude = {
  product: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  movements: { select: { type: true, quantityDelta: true } }
} satisfies Prisma.LotInclude;

type LotRecord = Prisma.LotGetPayload<{ include: typeof lotInclude }>;

function mapLot(lot: LotRecord): LotResponse {
  const received = lot.movements
    .filter((movement) => movement.type === "STOCK_IN")
    .reduce((total, movement) => total + movement.quantityDelta, 0);
  const saleMovementTotal = lot.movements
    .filter(
      (movement) =>
        movement.type === "SALE_OUT" ||
        movement.type === "SALE_CANCELLATION_IN"
    )
    .reduce((total, movement) => total + movement.quantityDelta, 0);
  const adjusted = lot.movements
    .filter(
      (movement) =>
        movement.type === "ADJUSTMENT_IN" || movement.type === "ADJUSTMENT_OUT"
    )
    .reduce((total, movement) => total + movement.quantityDelta, 0);

  return {
    id: lot.id,
    lotNumber: lot.lotNumber,
    product: lot.product,
    warehouse: lot.warehouse,
    receivedAt: lot.receivedAt.toISOString(),
    expiryDate: lot.expiryDate?.toISOString() ?? null,
    unitCost: lot.unitCost.toFixed(2),
    receivedQuantity: lot.receivedQuantity,
    received,
    sold: Math.max(0, -saleMovementTotal),
    adjusted,
    availableQuantity: lot.availableQuantity,
    isActive: lot.isActive,
    createdAt: lot.createdAt.toISOString()
  };
}

@Injectable()
export class InventoryService {
  constructor(private readonly database: DatabaseService) {}

  async listLots(
    productId: string,
    query: LotListQuery
  ): Promise<PaginatedLotsResponse> {
    const where: Prisma.LotWhereInput = {
      productId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status === "active"
        ? { isActive: true }
        : query.status === "archived"
          ? { isActive: false }
          : {})
    };
    const [items, total] = await Promise.all([
      this.database.client.lot.findMany({
        where,
        include: lotInclude,
        orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.lot.count({ where })
    ]);

    return {
      items: items.map(mapLot),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async getLot(productId: string, lotId: string): Promise<LotResponse> {
    const lot = await this.database.client.lot.findFirst({
      where: { id: lotId, productId },
      include: lotInclude
    });
    if (!lot) {
      throw this.lotNotFound();
    }
    return mapLot(lot);
  }

  async stockSummary(
    productId: string,
    warehouseId?: string
  ): Promise<StockSummaryResponse> {
    const [product, warehouse] = await Promise.all([
      this.database.client.product.findUnique({
        where: { id: productId },
        select: { id: true, code: true, name: true }
      }),
      warehouseId
        ? this.database.client.warehouse.findFirst({
            where: { id: warehouseId, isActive: true },
            select: { id: true, code: true, name: true }
          })
        : this.database.client.warehouse.findFirst({
            where: { isDefault: true, isActive: true },
            orderBy: [{ code: "asc" }, { id: "asc" }],
            select: { id: true, code: true, name: true }
          })
    ]);
    if (!product) {
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "ไม่พบสินค้า"
      });
    }
    if (!warehouse) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "ไม่พบคลังสินค้า"
      });
    }

    const aggregate = await this.database.client.lot.aggregate({
      where: {
        productId,
        warehouseId: warehouse.id,
        isActive: true
      },
      _sum: { availableQuantity: true },
      _count: { id: true }
    });

    return {
      product,
      warehouse,
      totalAvailable: aggregate._sum.availableQuantity ?? 0,
      activeLotCount: aggregate._count.id
    };
  }

  async reconcile(
    productId: string,
    warehouseId: string
  ): Promise<ReconciliationResponse> {
    const lots = await this.database.client.lot.findMany({
      where: { productId, warehouseId },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        lotNumber: true,
        availableQuantity: true,
        movements: { select: { quantityDelta: true } }
      }
    });
    const items = lots.map((lot) => {
      const movementTotal = lot.movements.reduce(
        (total, movement) => total + movement.quantityDelta,
        0
      );
      const difference = lot.availableQuantity - movementTotal;
      return {
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        availableQuantity: lot.availableQuantity,
        movementTotal,
        difference,
        isBalanced: difference === 0
      };
    });

    return {
      productId,
      warehouseId,
      isBalanced: items.every((item) => item.isBalanced),
      items
    };
  }

  private lotNotFound(): NotFoundException {
    return new NotFoundException({
      code: "LOT_NOT_FOUND",
      message: "ไม่พบ LOT สินค้า"
    });
  }
}
