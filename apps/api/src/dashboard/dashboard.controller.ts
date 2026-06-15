import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import {
  expiryAlertListQuerySchema,
  lowStockAlertListQuerySchema,
  Permission
} from "@warehouse/contracts";

import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DashboardService } from "./dashboard.service";

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "ตัวกรองการแจ้งเตือนไม่ถูกต้อง",
      details: parsed.error.flatten()
    });
  }
  return parsed.data;
}

@Controller("dashboard")
@UseGuards(SessionAuthGuard, PermissionGuard)
@RequirePermissions(Permission.DASHBOARD_VIEW)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("alerts")
  alerts() {
    return this.dashboard.getAlerts();
  }

  @Get("alerts/low-stock")
  lowStock(@Query() query: Record<string, unknown>) {
    return this.dashboard.listLowStock(
      parseOrThrow(lowStockAlertListQuerySchema, query)
    );
  }

  @Get("alerts/expiry")
  expiry(@Query() query: Record<string, unknown>) {
    return this.dashboard.listExpiryAlerts(
      parseOrThrow(expiryAlertListQuerySchema, query)
    );
  }
}
