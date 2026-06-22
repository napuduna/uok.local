import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  Role,
  type CustomerReportQuery,
  type GrossProfitReportResponse,
  type InventoryCurrentReportResponse,
  type InventoryExpiryReportQuery,
  type InventoryExpiryReportResponse,
  type InventoryLowStockReportResponse,
  type InventoryReportQuery,
  type NewCustomerReportResponse,
  type ReportDateRangeQuery,
  type ReportGroupBy,
  type RoleValue,
  type SalesReportResponse,
  type TopCustomerReportResponse
} from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

interface ReportContext {
  actorId: string;
  role: RoleValue;
}

@Injectable()
export class ReportsService {
  constructor(private readonly database: DatabaseService) {}

  async sales(
    query: ReportDateRangeQuery,
    context: ReportContext
  ): Promise<SalesReportResponse> {
    const sales = await this.listCompletedSales(query, context);
    const grouped = new Map<
      string,
      {
        invoiceCount: number;
        quantitySold: number;
        totalSales: Prisma.Decimal;
      }
    >();

    for (const sale of sales) {
      const period = reportPeriod(sale.soldAt, query.groupBy);
      const current = grouped.get(period) ?? {
        invoiceCount: 0,
        quantitySold: 0,
        totalSales: zero()
      };
      grouped.set(period, {
        invoiceCount: current.invoiceCount + 1,
        quantitySold:
          current.quantitySold +
          sale.items.reduce((total, item) => total + item.quantity, 0),
        totalSales: current.totalSales.add(sale.totalSales)
      });
    }

    const items = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, totals]) => ({
        period,
        invoiceCount: totals.invoiceCount,
        quantitySold: totals.quantitySold,
        totalSales: totals.totalSales.toFixed(2)
      }));
    const totals = items.reduce(
      (current, item) => ({
        invoiceCount: current.invoiceCount + item.invoiceCount,
        quantitySold: current.quantitySold + item.quantitySold,
        totalSales: current.totalSales.add(item.totalSales)
      }),
      {
        invoiceCount: 0,
        quantitySold: 0,
        totalSales: zero()
      }
    );

    return {
      ...paginate(items, query),
      totals: {
        invoiceCount: totals.invoiceCount,
        quantitySold: totals.quantitySold,
        totalSales: totals.totalSales.toFixed(2)
      }
    };
  }

  async grossProfit(
    query: ReportDateRangeQuery,
    context: ReportContext
  ): Promise<GrossProfitReportResponse> {
    const sales = await this.listCompletedSales(query, context);
    const grouped = new Map<
      string,
      {
        totalSales: Prisma.Decimal;
        totalCost: Prisma.Decimal;
        grossProfit: Prisma.Decimal;
      }
    >();

    for (const sale of sales) {
      const period = reportPeriod(sale.soldAt, query.groupBy);
      const current = grouped.get(period) ?? {
        totalSales: zero(),
        totalCost: zero(),
        grossProfit: zero()
      };
      grouped.set(period, {
        totalSales: current.totalSales.add(sale.totalSales),
        totalCost: current.totalCost.add(sale.totalCost),
        grossProfit: current.grossProfit.add(sale.grossProfit)
      });
    }

    const items = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, totals]) => ({
        period,
        totalSales: totals.totalSales.toFixed(2),
        totalCost: totals.totalCost.toFixed(2),
        grossProfit: totals.grossProfit.toFixed(2)
      }));
    const totals = items.reduce(
      (current, item) => ({
        totalSales: current.totalSales.add(item.totalSales),
        totalCost: current.totalCost.add(item.totalCost),
        grossProfit: current.grossProfit.add(item.grossProfit)
      }),
      {
        totalSales: zero(),
        totalCost: zero(),
        grossProfit: zero()
      }
    );

    return {
      ...paginate(items, query),
      totals: {
        totalSales: totals.totalSales.toFixed(2),
        totalCost: totals.totalCost.toFixed(2),
        grossProfit: totals.grossProfit.toFixed(2)
      }
    };
  }

  async currentInventory(
    query: InventoryReportQuery
  ): Promise<InventoryCurrentReportResponse> {
    const items = await this.inventoryRows();
    const totals = inventoryTotals(items);
    return {
      ...paginate(items, query),
      totals
    };
  }

  async lowStock(
    query: InventoryReportQuery
  ): Promise<InventoryLowStockReportResponse> {
    const items = (await this.inventoryRows())
      .map((item) => ({
        ...item,
        shortage: item.lowStockThreshold - item.totalAvailable
      }))
      .filter((item) => item.shortage > 0)
      .sort(
        (left, right) =>
          left.totalAvailable - right.totalAvailable ||
          left.product.code.localeCompare(right.product.code) ||
          left.product.id.localeCompare(right.product.id)
      );
    const totals = inventoryTotals(items);
    return {
      ...paginate(items, query),
      totals
    };
  }

  async expiry(
    query: InventoryExpiryReportQuery
  ): Promise<InventoryExpiryReportResponse> {
    const warehouseId = await this.defaultWarehouseId();
    const asOf = query.asOf
      ? bangkokBusinessDayStart(query.asOf)
      : new Date();
    const deadline = new Date(asOf.getTime() + query.daysAhead * DAY_IN_MS);
    const lots = await this.database.client.lot.findMany({
      where: {
        warehouseId,
        isActive: true,
        availableQuantity: { gt: 0 },
        expiryDate: { not: null },
        product: { isActive: true }
      },
      orderBy: [
        { expiryDate: "asc" },
        { receivedAt: "asc" },
        { createdAt: "asc" },
        { id: "asc" }
      ],
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        availableQuantity: true,
        unitCost: true,
        product: { select: { id: true, code: true, name: true } }
      }
    });

    const items = lots.flatMap((lot) => {
      if (!lot.expiryDate) return [];
      const isExpired = lot.expiryDate.getTime() < asOf.getTime();
      const isExpiring =
        lot.expiryDate.getTime() >= asOf.getTime() &&
        lot.expiryDate.getTime() <= deadline.getTime();
      if (
        (query.status === "expired" && !isExpired) ||
        (query.status === "expiring" && !isExpiring) ||
        (query.status === "all" && !isExpired && !isExpiring)
      ) {
        return [];
      }
      const inventoryValue = lot.unitCost.mul(lot.availableQuantity);
      return [
        {
          lot: { id: lot.id, lotNumber: lot.lotNumber },
          product: lot.product,
          expiryDate: lot.expiryDate.toISOString(),
          availableQuantity: lot.availableQuantity,
          unitCost: lot.unitCost.toFixed(2),
          inventoryValue: inventoryValue.toFixed(2),
          status: isExpired
            ? ("EXPIRED" as const)
            : ("EXPIRING_SOON" as const),
          daysUntilExpiry: businessDayDifference(lot.expiryDate, asOf)
        }
      ];
    });
    const totals = {
      quantity: items.reduce(
        (total, item) => total + item.availableQuantity,
        0
      ),
      inventoryValue: items
        .reduce(
          (total, item) => total.add(item.inventoryValue),
          zero()
        )
        .toFixed(2)
    };

    return {
      ...paginate(items, query),
      totals
    };
  }

  async topCustomers(
    query: CustomerReportQuery,
    context: ReportContext
  ): Promise<TopCustomerReportResponse> {
    const sales = await this.listCompletedSales(
      { ...query, groupBy: "day" },
      context
    );
    const grouped = new Map<
      string,
      {
        customer: {
          id: string;
          code: string;
          firstName: string;
          lastName: string;
        };
        invoiceCount: number;
        quantitySold: number;
        totalSales: Prisma.Decimal;
        grossProfit: Prisma.Decimal;
      }
    >();

    for (const sale of sales) {
      const current = grouped.get(sale.customer.id) ?? {
        customer: sale.customer,
        invoiceCount: 0,
        quantitySold: 0,
        totalSales: zero(),
        grossProfit: zero()
      };
      grouped.set(sale.customer.id, {
        customer: current.customer,
        invoiceCount: current.invoiceCount + 1,
        quantitySold:
          current.quantitySold +
          sale.items.reduce((total, item) => total + item.quantity, 0),
        totalSales: current.totalSales.add(sale.totalSales),
        grossProfit: current.grossProfit.add(sale.grossProfit)
      });
    }

    const items = [...grouped.values()]
      .sort(
        (left, right) =>
          right.totalSales.comparedTo(left.totalSales) ||
          left.customer.code.localeCompare(right.customer.code) ||
          left.customer.id.localeCompare(right.customer.id)
      )
      .map((item) => ({
        customer: item.customer,
        invoiceCount: item.invoiceCount,
        quantitySold: item.quantitySold,
        totalSales: item.totalSales.toFixed(2),
        grossProfit: item.grossProfit.toFixed(2)
      }));

    return paginate(items, query);
  }

  async newCustomers(
    query: CustomerReportQuery,
    context: ReportContext
  ): Promise<NewCustomerReportResponse> {
    this.assertSalesReportRole(context);
    const range = bangkokDateRange(query.dateFrom, query.dateTo);
    const where: Prisma.CustomerWhereInput = {
      joinedAt: { gte: range.start, lt: range.endExclusive }
    };
    const [customers, total] = await Promise.all([
      this.database.client.customer.findMany({
        where,
        orderBy: [
          { joinedAt: "desc" },
          { code: "asc" },
          { id: "asc" }
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          code: true,
          firstName: true,
          lastName: true,
          joinedAt: true
        }
      }),
      this.database.client.customer.count({ where })
    ]);

    return {
      items: customers.map((customer) => ({
        customer: {
          id: customer.id,
          code: customer.code,
          firstName: customer.firstName,
          lastName: customer.lastName
        },
        joinedAt: customer.joinedAt.toISOString()
      })),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  private async listCompletedSales(
    query: ReportDateRangeQuery,
    context: ReportContext
  ) {
    this.assertSalesReportRole(context);
    const range = bangkokDateRange(query.dateFrom, query.dateTo);
    return this.database.client.sale.findMany({
      where: {
        status: "COMPLETED",
        soldAt: { gte: range.start, lt: range.endExclusive },
        ...(context.role === Role.SALES
          ? { createdById: context.actorId }
          : {})
      },
      orderBy: [{ soldAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        soldAt: true,
        totalSales: true,
        totalCost: true,
        grossProfit: true,
        customer: {
          select: {
            id: true,
            code: true,
            firstName: true,
            lastName: true
          }
        },
        items: {
          orderBy: [{ productId: "asc" }, { id: "asc" }],
          select: { quantity: true }
        }
      }
    });
  }

  private assertSalesReportRole(context: ReportContext): void {
    if (
      context.role !== Role.ADMIN &&
      context.role !== Role.MANAGER &&
      context.role !== Role.SALES
    ) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "Sales reports are not available for this role"
      });
    }
  }

  private async inventoryRows() {
    const warehouseId = await this.defaultWarehouseId();
    const products = await this.database.client.product.findMany({
      where: { isActive: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        lowStockThreshold: true,
        lots: {
          where: { warehouseId, isActive: true },
          select: {
            availableQuantity: true,
            unitCost: true
          }
        }
      }
    });

    return products.map((product) => {
      const totalAvailable = product.lots.reduce(
        (total, lot) => total + lot.availableQuantity,
        0
      );
      const inventoryValue = product.lots.reduce(
        (total, lot) =>
          total.add(lot.unitCost.mul(lot.availableQuantity)),
        zero()
      );
      return {
        product: {
          id: product.id,
          code: product.code,
          name: product.name
        },
        totalAvailable,
        lowStockThreshold: product.lowStockThreshold,
        inventoryValue: inventoryValue.toFixed(2)
      };
    });
  }

  private async defaultWarehouseId(): Promise<string> {
    const warehouse = await this.database.client.warehouse.findFirst({
      where: { isDefault: true, isActive: true },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: { id: true }
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "Default warehouse was not found"
      });
    }
    return warehouse.id;
  }
}

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

function paginate<T>(
  items: T[],
  query: { page: number; pageSize: number }
): { items: T[]; page: number; pageSize: number; total: number } {
  const offset = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(offset, offset + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: items.length
  };
}

function inventoryTotals(items: { totalAvailable: number; inventoryValue: string }[]) {
  return {
    quantity: items.reduce((total, item) => total + item.totalAvailable, 0),
    inventoryValue: items
      .reduce((total, item) => total.add(item.inventoryValue), zero())
      .toFixed(2)
  };
}

function bangkokDateRange(dateFrom: string, dateTo: string) {
  const start = bangkokBusinessDayStart(dateFrom);
  const endStart = bangkokBusinessDayStart(dateTo);
  return {
    start,
    endExclusive: new Date(endStart.getTime() + DAY_IN_MS)
  };
}

function bangkokBusinessDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

function bangkokDateKey(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function reportPeriod(value: Date, groupBy: ReportGroupBy): string {
  const date = bangkokDateKey(value);
  if (groupBy === "year") return date.slice(0, 4);
  if (groupBy === "month") return date.slice(0, 7);
  return date;
}

function businessDayDifference(expiryDate: Date, asOf: Date): number {
  const [expiryYear = 0, expiryMonth = 1, expiryDay = 1] =
    bangkokDateKey(expiryDate)
    .split("-")
    .map((part) => Number(part));
  const [currentYear = 0, currentMonth = 1, currentDay = 1] =
    bangkokDateKey(asOf)
    .split("-")
    .map((part) => Number(part));
  const expiryUtc = Date.UTC(expiryYear, expiryMonth - 1, expiryDay);
  const currentUtc = Date.UTC(currentYear, currentMonth - 1, currentDay);
  return Math.round((expiryUtc - currentUtc) / DAY_IN_MS);
}
