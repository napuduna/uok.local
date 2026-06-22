import { Injectable } from "@nestjs/common";

import {
  type CreateExportRequest,
  type ExportSnapshot,
  type RoleValue
} from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { ReportsService } from "../reports/reports.service";

interface ExportContext {
  actorId: string;
  role: RoleValue;
}

interface PageResult {
  items: unknown[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class ExportSnapshotService {
  constructor(private readonly reports: ReportsService) {}

  async create(
    request: CreateExportRequest,
    context: ExportContext
  ): Promise<ExportSnapshot> {
    switch (request.reportType) {
      case "SALES":
        return this.sales(request, context);
      case "GROSS_PROFIT":
        return this.grossProfit(request, context);
      case "INVENTORY_CURRENT":
        return this.inventoryCurrent(request);
      case "INVENTORY_LOW_STOCK":
        return this.inventoryLowStock(request);
      case "INVENTORY_EXPIRY":
        return this.inventoryExpiry(request);
      case "CUSTOMERS_TOP":
        return this.topCustomers(request, context);
      case "CUSTOMERS_NEW":
        return this.newCustomers(request, context);
    }
  }

  private async sales(
    request: Extract<CreateExportRequest, { reportType: "SALES" }>,
    context: ExportContext
  ): Promise<ExportSnapshot> {
    const result = await collectPages((page) =>
      this.reports.sales({ ...request.filters, page, pageSize: 100 }, context)
    );
    const response = result.first;
    return snapshot(
      request,
      "รายงานยอดขาย",
      [
        column("period", "ช่วงเวลา", 18),
        column("invoiceCount", "จำนวนบิล", 14),
        column("quantitySold", "จำนวนสินค้า", 14),
        column("totalSales", "ยอดขาย (บาท)", 18)
      ],
      result.items,
      response.totals
    );
  }

  private async grossProfit(
    request: Extract<CreateExportRequest, { reportType: "GROSS_PROFIT" }>,
    context: ExportContext
  ): Promise<ExportSnapshot> {
    const result = await collectPages((page) =>
      this.reports.grossProfit(
        { ...request.filters, page, pageSize: 100 },
        context
      )
    );
    const response = result.first;
    return snapshot(
      request,
      "รายงานกำไรขั้นต้น",
      [
        column("period", "ช่วงเวลา", 18),
        column("totalSales", "ยอดขาย (บาท)", 18),
        column("totalCost", "ต้นทุน (บาท)", 18),
        column("grossProfit", "กำไรขั้นต้น (บาท)", 20)
      ],
      result.items,
      response.totals
    );
  }

  private async inventoryCurrent(
    request: Extract<CreateExportRequest, { reportType: "INVENTORY_CURRENT" }>
  ): Promise<ExportSnapshot> {
    const result = await collectPages((page) =>
      this.reports.currentInventory({ page, pageSize: 100 })
    );
    const response = result.first;
    return snapshot(
      request,
      "รายงานสต๊อกปัจจุบัน",
      [
        column("productCode", "รหัสสินค้า", 18),
        column("productName", "สินค้า", 28),
        column("totalAvailable", "คงเหลือ", 14),
        column("lowStockThreshold", "จุดเตือน", 14),
        column("inventoryValue", "มูลค่าสต๊อก (บาท)", 20)
      ],
      result.items.map((item) => ({
        productCode: item.product.code,
        productName: item.product.name,
        totalAvailable: item.totalAvailable,
        lowStockThreshold: item.lowStockThreshold,
        inventoryValue: item.inventoryValue
      })),
      response.totals
    );
  }

  private async inventoryLowStock(
    request: Extract<CreateExportRequest, { reportType: "INVENTORY_LOW_STOCK" }>
  ): Promise<ExportSnapshot> {
    const result = await collectPages((page) =>
      this.reports.lowStock({ page, pageSize: 100 })
    );
    const response = result.first;
    return snapshot(
      request,
      "รายงานสินค้าใกล้หมด",
      [
        column("productCode", "รหัสสินค้า", 18),
        column("productName", "สินค้า", 28),
        column("totalAvailable", "คงเหลือ", 14),
        column("lowStockThreshold", "จุดเตือน", 14),
        column("shortage", "ต่ำกว่าจุดเตือน", 16),
        column("inventoryValue", "มูลค่าสต๊อก (บาท)", 20)
      ],
      result.items.map((item) => ({
        productCode: item.product.code,
        productName: item.product.name,
        totalAvailable: item.totalAvailable,
        lowStockThreshold: item.lowStockThreshold,
        shortage: item.shortage,
        inventoryValue: item.inventoryValue
      })),
      response.totals
    );
  }

  private async inventoryExpiry(
    request: Extract<CreateExportRequest, { reportType: "INVENTORY_EXPIRY" }>
  ): Promise<ExportSnapshot> {
    const result = await collectPages((page) =>
      this.reports.expiry({ ...request.filters, page, pageSize: 100 })
    );
    const response = result.first;
    return snapshot(
      request,
      "รายงานสินค้าใกล้หมดอายุ",
      [
        column("lotNumber", "LOT", 18),
        column("productCode", "รหัสสินค้า", 18),
        column("productName", "สินค้า", 26),
        column("expiryDate", "วันหมดอายุ", 22),
        column("availableQuantity", "คงเหลือ", 14),
        column("unitCost", "ต้นทุนต่อหน่วย", 18),
        column("inventoryValue", "มูลค่า (บาท)", 18),
        column("status", "สถานะ", 18),
        column("daysUntilExpiry", "จำนวนวัน", 14)
      ],
      result.items.map((item) => ({
        lotNumber: item.lot.lotNumber,
        productCode: item.product.code,
        productName: item.product.name,
        expiryDate: item.expiryDate,
        availableQuantity: item.availableQuantity,
        unitCost: item.unitCost,
        inventoryValue: item.inventoryValue,
        status: item.status,
        daysUntilExpiry: item.daysUntilExpiry
      })),
      response.totals
    );
  }

  private async topCustomers(
    request: Extract<CreateExportRequest, { reportType: "CUSTOMERS_TOP" }>,
    context: ExportContext
  ): Promise<ExportSnapshot> {
    const result = await collectPages((page) =>
      this.reports.topCustomers(
        { ...request.filters, page, pageSize: 100 },
        context
      )
    );
    const response = result.first;
    const totals = result.items.reduce(
      (current, item) => ({
        invoiceCount: current.invoiceCount + item.invoiceCount,
        quantitySold: current.quantitySold + item.quantitySold,
        totalSales: current.totalSales.add(item.totalSales),
        grossProfit: current.grossProfit.add(item.grossProfit)
      }),
      {
        invoiceCount: 0,
        quantitySold: 0,
        totalSales: new Prisma.Decimal(0),
        grossProfit: new Prisma.Decimal(0)
      }
    );
    return snapshot(
      request,
      "รายงานลูกค้ายอดซื้อสูงสุด",
      [
        column("customerCode", "รหัสลูกค้า", 18),
        column("customerName", "ชื่อลูกค้า", 28),
        column("invoiceCount", "จำนวนบิล", 14),
        column("quantitySold", "จำนวนสินค้า", 14),
        column("totalSales", "ยอดซื้อ (บาท)", 18),
        column("grossProfit", "กำไรขั้นต้น (บาท)", 20)
      ],
      result.items.map((item) => ({
        customerCode: item.customer.code,
        customerName:
          `${item.customer.firstName} ${item.customer.lastName}`.trim(),
        invoiceCount: item.invoiceCount,
        quantitySold: item.quantitySold,
        totalSales: item.totalSales,
        grossProfit: item.grossProfit
      })),
      {
        invoiceCount: totals.invoiceCount,
        quantitySold: totals.quantitySold,
        totalSales: totals.totalSales.toFixed(2),
        grossProfit: totals.grossProfit.toFixed(2),
        recordCount: response.total
      }
    );
  }

  private async newCustomers(
    request: Extract<CreateExportRequest, { reportType: "CUSTOMERS_NEW" }>,
    context: ExportContext
  ): Promise<ExportSnapshot> {
    const result = await collectPages((page) =>
      this.reports.newCustomers(
        { ...request.filters, page, pageSize: 100 },
        context
      )
    );
    const response = result.first;
    return snapshot(
      request,
      "รายงานลูกค้าใหม่",
      [
        column("customerCode", "รหัสลูกค้า", 18),
        column("customerName", "ชื่อลูกค้า", 30),
        column("joinedAt", "วันที่เป็นลูกค้า", 24)
      ],
      result.items.map((item) => ({
        customerCode: item.customer.code,
        customerName:
          `${item.customer.firstName} ${item.customer.lastName}`.trim(),
        joinedAt: item.joinedAt
      })),
      { recordCount: response.total }
    );
  }
}

async function collectPages<R extends PageResult>(
  fetchPage: (page: number) => Promise<R>
): Promise<{ items: R["items"]; first: R }> {
  const first = await fetchPage(1);
  const items: unknown[] = [...first.items];
  const pageCount = Math.ceil(first.total / first.pageSize);
  for (let page = 2; page <= pageCount; page += 1) {
    const response = await fetchPage(page);
    items.push(...response.items);
  }
  return { items: items, first };
}

function column(key: string, label: string, width: number) {
  return { key, label, width };
}

function snapshot(
  request: CreateExportRequest,
  title: string,
  columns: ExportSnapshot["columns"],
  rows: ExportSnapshot["rows"],
  totals: ExportSnapshot["totals"]
): ExportSnapshot {
  return {
    reportType: request.reportType,
    title,
    generatedAt: new Date().toISOString(),
    filters: request.filters,
    columns,
    rows,
    totals
  };
}
