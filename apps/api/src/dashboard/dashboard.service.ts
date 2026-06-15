import { Injectable, NotFoundException } from "@nestjs/common";

import type {
  DashboardAlertsResponse,
  ExpiryAlertListQuery,
  ExpiryAlertResponse,
  LowStockAlertListQuery,
  LowStockAlertResponse,
  PaginatedExpiryAlertsResponse,
  PaginatedLowStockAlertsResponse
} from "@warehouse/contracts";

import { DatabaseService } from "../database/database.service";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PREVIEW_SIZE = 4;

@Injectable()
export class DashboardService {
  constructor(private readonly database: DatabaseService) {}

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
