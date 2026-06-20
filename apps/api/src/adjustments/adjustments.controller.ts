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
  createInventoryAdjustmentRequestSchema,
  inventoryAdjustmentListQuerySchema,
  Permission
} from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { AdjustmentsService } from "./adjustments.service";

const idSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(1).max(200);

@Controller("adjustments")
@UseGuards(SessionAuthGuard, PermissionGuard)
export class AdjustmentsController {
  constructor(private readonly adjustments: AdjustmentsService) {}

  @Get()
  @RequirePermissions(Permission.STOCK_READ)
  list(@Query() query: Record<string, unknown>) {
    const parsed = inventoryAdjustmentListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw this.validationError(
        "ตัวกรองรายการปรับสต๊อกไม่ถูกต้อง",
        parsed.error
      );
    }
    return this.adjustments.list(parsed.data);
  }

  @Get(":id")
  @RequirePermissions(Permission.STOCK_READ)
  get(@Param("id") id: string) {
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      throw this.validationError(
        "รหัสรายการปรับสต๊อกไม่ถูกต้อง",
        parsed.error
      );
    }
    return this.adjustments.get(parsed.data);
  }

  @Post()
  @RequirePermissions(Permission.STOCK_MANAGE)
  create(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    const parsedBody = createInventoryAdjustmentRequestSchema.safeParse(body);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedBody.success) {
      throw this.validationError(
        "ข้อมูลปรับสต๊อกไม่ถูกต้อง",
        parsedBody.error
      );
    }
    if (!parsedKey.success) {
      throw this.validationError("ต้องระบุ Idempotency-Key", parsedKey.error);
    }
    return this.adjustments.create(parsedBody.data, {
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
