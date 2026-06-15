import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import {
  createStockInRequestSchema,
  Permission,
  stockInListQuerySchema
} from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { StockInsService } from "./stock-ins.service";

const idSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(1).max(200);

@Controller("stock-ins")
@UseGuards(SessionAuthGuard, PermissionGuard)
export class StockInsController {
  constructor(private readonly stockIns: StockInsService) {}

  @Get()
  @RequirePermissions(Permission.STOCK_READ)
  list(@Query() query: Record<string, unknown>) {
    const parsed = stockInListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw this.validationError(
        "ตัวกรองรายการรับสินค้าไม่ถูกต้อง",
        parsed.error
      );
    }
    return this.stockIns.list(parsed.data);
  }

  @Get(":id")
  @RequirePermissions(Permission.STOCK_READ)
  get(@Param("id") id: string) {
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      throw this.validationError("รหัสรายการรับสินค้าไม่ถูกต้อง", parsed.error);
    }
    return this.stockIns.get(parsed.data);
  }

  @Post()
  @RequirePermissions(Permission.STOCK_MANAGE)
  create(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    const parsedBody = createStockInRequestSchema.safeParse(body);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedBody.success) {
      throw this.validationError("ข้อมูลรับสินค้าไม่ถูกต้อง", parsedBody.error);
    }
    if (!parsedKey.success) {
      throw this.validationError("ต้องระบุ Idempotency-Key", parsedKey.error);
    }
    return this.stockIns.create(parsedBody.data, {
      idempotencyKey: parsedKey.data,
      actorId: request.auth!.id,
      requestId: request.requestId
    });
  }

  private validationError(message: string, error: z.ZodError) {
    return new BadRequestException({
      code: "VALIDATION_ERROR",
      message,
      details: error.flatten()
    });
  }
}
