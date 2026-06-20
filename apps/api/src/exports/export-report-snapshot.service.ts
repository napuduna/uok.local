import { Injectable } from "@nestjs/common";

import type {
  CustomerReportQuery,
  ExportReportType,
  InventoryExpiryReportQuery,
  ReportDateRangeQuery,
  RoleValue
} from "@warehouse/contracts";

import { ReportsService } from "../reports/reports.service";

const EXPORT_PAGE_SIZE = 100;

interface ReportContext {
  actorId: string;
  role: RoleValue;
}

interface PaginatedReport<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class ExportReportSnapshotService {
  constructor(private readonly reports: ReportsService) {}

  async exportSnapshot(
    reportType: ExportReportType,
    filters: Record<string, unknown>,
    context: ReportContext
  ): Promise<Record<string, unknown>> {
    switch (reportType) {
      case "SALES":
        return this.collectPages((page) =>
          this.reports.sales(
            {
              ...(filters as Omit<ReportDateRangeQuery, "page" | "pageSize">),
              page,
              pageSize: EXPORT_PAGE_SIZE
            },
            context
          )
        );
      case "GROSS_PROFIT":
        return this.collectPages((page) =>
          this.reports.grossProfit(
            {
              ...(filters as Omit<ReportDateRangeQuery, "page" | "pageSize">),
              page,
              pageSize: EXPORT_PAGE_SIZE
            },
            context
          )
        );
      case "INVENTORY_CURRENT":
        return this.collectPages((page) =>
          this.reports.currentInventory({
            page,
            pageSize: EXPORT_PAGE_SIZE
          })
        );
      case "INVENTORY_LOW_STOCK":
        return this.collectPages((page) =>
          this.reports.lowStock({
            page,
            pageSize: EXPORT_PAGE_SIZE
          })
        );
      case "INVENTORY_EXPIRY":
        return this.collectPages((page) =>
          this.reports.expiry({
            ...(filters as Omit<
              InventoryExpiryReportQuery,
              "page" | "pageSize"
            >),
            page,
            pageSize: EXPORT_PAGE_SIZE
          })
        );
      case "TOP_CUSTOMERS":
        return this.collectPages((page) =>
          this.reports.topCustomers(
            {
              ...(filters as Omit<CustomerReportQuery, "page" | "pageSize">),
              page,
              pageSize: EXPORT_PAGE_SIZE
            },
            context
          )
        );
      case "NEW_CUSTOMERS":
        return this.collectPages((page) =>
          this.reports.newCustomers(
            {
              ...(filters as Omit<CustomerReportQuery, "page" | "pageSize">),
              page,
              pageSize: EXPORT_PAGE_SIZE
            },
            context
          )
        );
    }
  }

  private async collectPages<
    TItem,
    TReport extends PaginatedReport<TItem>
  >(
    loadPage: (page: number) => Promise<TReport>
  ): Promise<TReport> {
    const first = await loadPage(1);
    const items = [...first.items];
    const pageCount = Math.ceil(first.total / EXPORT_PAGE_SIZE);
    for (let page = 2; page <= pageCount; page += 1) {
      const next = await loadPage(page);
      items.push(...next.items);
    }
    return {
      ...first,
      items,
      page: 1
    };
  }
}
