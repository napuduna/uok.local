import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import {
  customerReportQuerySchema,
  inventoryExpiryReportQuerySchema,
  inventoryReportQuerySchema,
  Permission,
  reportDateRangeQuerySchema
} from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import {
  RequireAnyPermissions,
  RequirePermissions
} from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ReportsService } from "./reports.service";

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Invalid report filters",
      details: parsed.error.flatten()
    });
  }
  return parsed.data;
}

function reportContext(request: AuthenticatedRequest) {
  return {
    actorId: request.auth!.id,
    role: request.auth!.role
  };
}

@Controller("reports")
@UseGuards(SessionAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("sales")
  @RequireAnyPermissions(
    Permission.REPORT_SALES_ALL,
    Permission.REPORT_SALES_OWN
  )
  sales(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    return this.reports.sales(
      parseOrThrow(reportDateRangeQuerySchema, query),
      reportContext(request)
    );
  }

  @Get("gross-profit")
  @RequireAnyPermissions(
    Permission.REPORT_SALES_ALL,
    Permission.REPORT_SALES_OWN
  )
  grossProfit(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    return this.reports.grossProfit(
      parseOrThrow(reportDateRangeQuerySchema, query),
      reportContext(request)
    );
  }

  @Get("inventory/current")
  @RequirePermissions(Permission.REPORT_STOCK)
  currentInventory(@Query() query: Record<string, unknown>) {
    return this.reports.currentInventory(
      parseOrThrow(inventoryReportQuerySchema, query)
    );
  }

  @Get("inventory/low-stock")
  @RequirePermissions(Permission.REPORT_STOCK)
  lowStock(@Query() query: Record<string, unknown>) {
    return this.reports.lowStock(
      parseOrThrow(inventoryReportQuerySchema, query)
    );
  }

  @Get("inventory/expiry")
  @RequirePermissions(Permission.REPORT_STOCK)
  expiry(@Query() query: Record<string, unknown>) {
    return this.reports.expiry(
      parseOrThrow(inventoryExpiryReportQuerySchema, query)
    );
  }

  @Get("customers/top")
  @RequireAnyPermissions(
    Permission.REPORT_SALES_ALL,
    Permission.REPORT_SALES_OWN
  )
  topCustomers(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    return this.reports.topCustomers(
      parseOrThrow(customerReportQuerySchema, query),
      reportContext(request)
    );
  }

  @Get("customers/new")
  @RequireAnyPermissions(
    Permission.REPORT_SALES_ALL,
    Permission.REPORT_SALES_OWN
  )
  newCustomers(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    return this.reports.newCustomers(
      parseOrThrow(customerReportQuerySchema, query),
      reportContext(request)
    );
  }
}
