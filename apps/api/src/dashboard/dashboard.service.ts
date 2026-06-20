import { Injectable, NotFoundException } from "@nestjs/common";

import type {
  DashboardAlertsResponse,
  DashboardSummaryResponse,
  ExpiryAlertListQuery,
  ExpiryAlertResponse,
  LowStockAlertListQuery,
  LowStockAlertResponse,
  PaginatedExpiryAlertsResponse,
  PaginatedLowStockAlertsResponse
} from "@warehouse/contracts";
import { Role, type RoleValue } from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PREVIEW_SIZE = 4;

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

  async getSummary(context: {
    actorId: string;
    role: RoleValue;
  }): Promise<DashboardSummaryResponse> {
    const warehouse = await this.getDefaultWarehouse();
    const asOf = new Date();
    const todayStart = bangkokDayStart(asOf);
    const monthStart = bangkokMonthStart(asOf);
    const monthSalesWhere = this.salesWhere(context, monthStart);
    const todaySalesWhere = this.salesWhere(context, todayStart);
    const canSeeInventoryValue =
      context.role === Role.ADMIN ||
      context.role === Role.MANAGER ||
      context.role === Role.WAREHOUSE;

    const [
      productCount,
      stockQuantity,
      customerCount,
      lowStock,
      todayTotals,
      monthTotals,
      inventoryValue,
      dailySales,
      topProducts
    ] = await Promise.all([
      this.database.client.product.count({ where: { isActive: true } }),
      this.database.client.lot.aggregate({
        where: {
          warehouseId: warehouse.id,
          isActive: true,
          product: { isActive: true }
        },
        _sum: { availableQuantity: true }
      }),
      this.database.client.customer.count({ where: { isActive: true } }),
      this.listLowStock({ page: 1, pageSize: 1 }),
      todaySalesWhere
        ? this.database.client.sale.aggregate({
            where: todaySalesWhere,
            _sum: {
              totalSales: true,
              totalCost: true,
              grossProfit: true
            }
          })
        : null,
      monthSalesWhere
        ? this.database.client.sale.aggregate({
            where: monthSalesWhere,
            _sum: {
              totalSales: true,
              totalCost: true,
              grossProfit: true
            }
          })
        : null,
      canSeeInventoryValue
        ? this.inventoryValue(warehouse.id)
        : Promise.resolve(null),
      monthSalesWhere ? this.dailySales(monthSalesWhere) : Promise.resolve([]),
      monthSalesWhere ? this.topProducts(monthSalesWhere) : Promise.resolve([])
    ]);

    return {
      asOf: asOf.toISOString(),
      warehouse,
      cards: {
        productCount,
        stockQuantity: stockQuantity._sum.availableQuantity ?? 0,
        customerCount,
        lowStockCount: lowStock.total,
        todaySales: todayTotals ? decimalOrZero(todayTotals._sum.totalSales) : null,
        monthSales: monthTotals ? decimalOrZero(monthTotals._sum.totalSales) : null,
        inventoryValue,
        monthSoldCost: monthTotals
          ? decimalOrZero(monthTotals._sum.totalCost)
          : null,
        monthGrossProfit: monthTotals
          ? decimalOrZero(monthTotals._sum.grossProfit)
          : null
      },
      dailySales,
      topProducts
    };
  }

  async listLowStock(
    query: LowStockAlertListQuery
  ): Promise<PaginatedLowStockAlertsResponse> {
    const warehouse = await this.getDefaultWarehouse();
    const products = await this.database.client.product.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        lowStockThreshold: true,
        lots: {
          where: {
            warehouseId: warehouse.id,
            isActive: true
          },
          select: { availableQuantity: true }
        }
      }
    });

    const alerts = products
      .map<LowStockAlertResponse>((product) => {
        const totalAvailable = product.lots.reduce(
          (total, lot) => total + lot.availableQuantity,
          0
        );
        return {
          product: {
            id: product.id,
            code: product.code,
            name: product.name
          },
          totalAvailable,
          lowStockThreshold: product.lowStockThreshold,
          shortage: product.lowStockThreshold - totalAvailable
        };
      })
      .filter((alert) => alert.shortage > 0)
      .sort(
        (left, right) =>
          left.totalAvailable - right.totalAvailable ||
          left.product.code.localeCompare(right.product.code) ||
          left.product.id.localeCompare(right.product.id)
      );
    const offset = (query.page - 1) * query.pageSize;

    return {
      items: alerts.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: alerts.length
    };
  }

  async listExpiryAlerts(
    query: ExpiryAlertListQuery
  ): Promise<PaginatedExpiryAlertsResponse> {
    const warehouse = await this.getDefaultWarehouse();
    const now = new Date();
    const deadline = new Date(now.getTime() + query.daysAhead * DAY_IN_MS);
    const expiryDate =
      query.status === "expired"
        ? { lt: now }
        : query.status === "expiring"
          ? { gte: now, lte: deadline }
          : { lte: deadline };
    const where = {
      warehouseId: warehouse.id,
      isActive: true,
      availableQuantity: { gt: 0 },
      expiryDate,
      product: { isActive: true }
    } as const;

    const [lots, total] = await Promise.all([
      this.database.client.lot.findMany({
        where,
        orderBy: [
          { expiryDate: "asc" },
          { receivedAt: "asc" },
          { createdAt: "asc" },
          { id: "asc" }
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          availableQuantity: true,
          product: {
            select: { id: true, code: true, name: true }
          }
        }
      }),
      this.database.client.lot.count({ where })
    ]);

    return {
      items: lots.map((lot) => this.mapExpiryAlert(lot, now)),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async getAlerts(): Promise<DashboardAlertsResponse> {
    const warehouse = await this.getDefaultWarehouse();
    const [lowStock, expiry, expired, expiring] = await Promise.all([
      this.listLowStock({ page: 1, pageSize: PREVIEW_SIZE }),
      this.listExpiryAlerts({
        page: 1,
        pageSize: PREVIEW_SIZE,
        status: "all",
        daysAhead: 30
      }),
      this.listExpiryAlerts({
        page: 1,
        pageSize: 1,
        status: "expired",
        daysAhead: 30
      }),
      this.listExpiryAlerts({
        page: 1,
        pageSize: 1,
        status: "expiring",
        daysAhead: 30
      })
    ]);

    return {
      warehouse,
      lowStockCount: lowStock.total,
      expiredLotCount: expired.total,
      expiringSoonLotCount: expiring.total,
      lowStockItems: lowStock.items,
      expiryItems: expiry.items
    };
  }

  private async getDefaultWarehouse() {
    const warehouse = await this.database.client.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: { id: true, code: true, name: true }
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "ไม่พบคลังสินค้าหลัก"
      });
    }
    return warehouse;
  }

  private salesWhere(
    context: { actorId: string; role: RoleValue },
    from: Date
  ): Prisma.SaleWhereInput | null {
    if (context.role === Role.WAREHOUSE) return null;
    return {
      status: "COMPLETED",
      soldAt: { gte: from },
      ...(context.role === Role.SALES ? { createdById: context.actorId } : {})
    };
  }

  private async inventoryValue(warehouseId: string): Promise<string> {
    const rows = await this.database.client.$queryRaw<{ value: string }[]>`
      SELECT COALESCE(SUM("Lot"."availableQuantity" * "Lot"."unitCost"), 0)::text AS "value"
      FROM "Lot"
      INNER JOIN "Product" ON "Product"."id" = "Lot"."productId"
      WHERE "Lot"."warehouseId" = ${warehouseId}
        AND "Lot"."isActive" = true
        AND "Product"."isActive" = true
    `;
    return normalizeDecimalText(rows[0]?.value ?? "0");
  }

  private async dailySales(where: Prisma.SaleWhereInput) {
    const sales = await this.database.client.sale.findMany({
      where,
      orderBy: [{ soldAt: "asc" }, { id: "asc" }],
      select: {
        soldAt: true,
        totalSales: true,
        totalCost: true,
        grossProfit: true
      }
    });
    const byDate = new Map<
      string,
      { totalSales: Prisma.Decimal; totalCost: Prisma.Decimal; grossProfit: Prisma.Decimal }
    >();
    for (const sale of sales) {
      const key = bangkokDateKey(sale.soldAt);
      const current =
        byDate.get(key) ??
        {
          totalSales: new Prisma.Decimal(0),
          totalCost: new Prisma.Decimal(0),
          grossProfit: new Prisma.Decimal(0)
        };
      byDate.set(key, {
        totalSales: current.totalSales.add(sale.totalSales),
        totalCost: current.totalCost.add(sale.totalCost),
        grossProfit: current.grossProfit.add(sale.grossProfit)
      });
    }
    return [...byDate.entries()].map(([date, totals]) => ({
      date,
      totalSales: totals.totalSales.toFixed(2),
      totalCost: totals.totalCost.toFixed(2),
      grossProfit: totals.grossProfit.toFixed(2)
    }));
  }

  private async topProducts(where: Prisma.SaleWhereInput) {
    const items = await this.database.client.saleItem.findMany({
      where: { sale: where },
      select: {
        quantity: true,
        salesSubtotal: true,
        product: { select: { id: true, code: true, name: true } }
      }
    });
    const grouped = new Map<
      string,
      {
        product: { id: string; code: string; name: string };
        quantitySold: number;
        totalSales: Prisma.Decimal;
      }
    >();
    for (const item of items) {
      const current =
        grouped.get(item.product.id) ??
        {
          product: item.product,
          quantitySold: 0,
          totalSales: new Prisma.Decimal(0)
        };
      grouped.set(item.product.id, {
        product: item.product,
        quantitySold: current.quantitySold + item.quantity,
        totalSales: current.totalSales.add(item.salesSubtotal)
      });
    }
    return [...grouped.values()]
      .sort(
        (left, right) =>
          right.quantitySold - left.quantitySold ||
          left.product.code.localeCompare(right.product.code) ||
          left.product.id.localeCompare(right.product.id)
      )
      .slice(0, 5)
      .map((item) => ({
        product: item.product,
        quantitySold: item.quantitySold,
        totalSales: item.totalSales.toFixed(2)
      }));
  }

  private mapExpiryAlert(
    lot: {
      id: string;
      lotNumber: string;
      expiryDate: Date | null;
      availableQuantity: number;
      product: { id: string; code: string; name: string };
    },
    now: Date
  ): ExpiryAlertResponse {
    const expiryDate = lot.expiryDate;
    if (!expiryDate) {
      throw new Error("Expiry alert query returned a lot without expiry date");
    }
    const isExpired = expiryDate.getTime() < now.getTime();

    return {
      lot: { id: lot.id, lotNumber: lot.lotNumber },
      product: lot.product,
      expiryDate: expiryDate.toISOString(),
      availableQuantity: lot.availableQuantity,
      status: isExpired ? "EXPIRED" : "EXPIRING_SOON",
      daysUntilExpiry: Math.ceil(
        (expiryDate.getTime() - now.getTime()) / DAY_IN_MS
      )
    };
  }
}

function decimalOrZero(value: Prisma.Decimal | null | undefined): string {
  return (value ?? new Prisma.Decimal(0)).toFixed(2);
}

function normalizeDecimalText(value: string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

function bangkokDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function bangkokDayStart(value: Date): Date {
  return new Date(`${bangkokDateKey(value)}T00:00:00+07:00`);
}

function bangkokMonthStart(value: Date): Date {
  const [year, month] = bangkokDateKey(value).split("-");
  return new Date(`${year}-${month}-01T00:00:00+07:00`);
}
