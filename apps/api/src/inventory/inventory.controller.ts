import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import { lotListQuerySchema, Permission } from "@warehouse/contracts";

import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { InventoryService } from "./inventory.service";

const idSchema = z.string().uuid();

function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "รหัสข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten()
    });
  }
  return parsed.data;
}

@Controller("products/:productId")
@UseGuards(SessionAuthGuard, PermissionGuard)
@RequirePermissions(Permission.STOCK_READ)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("stock")
  stockSummary(
    @Param("productId") productId: string,
    @Query("warehouseId") warehouseId?: string
  ) {
    return this.inventory.stockSummary(
      parseId(productId),
      warehouseId ? parseId(warehouseId) : undefined
    );
  }

  @Get("lots")
  listLots(
    @Param("productId") productId: string,
    @Query() query: Record<string, unknown>
  ) {
    const parsed = lotListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "ตัวกรอง LOT ไม่ถูกต้อง",
        details: parsed.error.flatten()
      });
    }
    return this.inventory.listLots(parseId(productId), parsed.data);
  }

  @Get("lots/:lotId")
  getLot(@Param("productId") productId: string, @Param("lotId") lotId: string) {
    return this.inventory.getLot(parseId(productId), parseId(lotId));
  }

  @Get("reconciliation")
  reconcile(
    @Param("productId") productId: string,
    @Query("warehouseId") warehouseId: string | undefined
  ) {
    if (!warehouseId) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "ต้องระบุคลังสินค้า"
      });
    }
    return this.inventory.reconcile(parseId(productId), parseId(warehouseId));
  }
}
