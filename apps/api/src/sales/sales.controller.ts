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
  cancelSaleRequestSchema,
  createSaleRequestSchema,
  Permission,
  saleCatalogQuerySchema,
  saleListQuerySchema
} from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import {
  RequireAnyPermissions,
  RequirePermissions
} from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { SalesService } from "./sales.service";

const idSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(1).max(200);

@Controller("sales")
@UseGuards(SessionAuthGuard, PermissionGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get("catalog")
  @RequireAnyPermissions(
    Permission.SALE_CREATE,
    Permission.SALE_READ_ALL,
    Permission.SALE_READ_OWN
  )
  catalog(@Query() query: Record<string, unknown>) {
    const parsed = saleCatalogQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw this.validationError(
        "ตัวกรองสินค้าสำหรับการขายไม่ถูกต้อง",
        parsed.error
      );
    }
    return this.sales.catalog(parsed.data);
  }

  @Get()
  @RequireAnyPermissions(Permission.SALE_READ_ALL, Permission.SALE_READ_OWN)
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    const parsed = saleListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw this.validationError(
        "ตัวกรองรายการขายไม่ถูกต้อง",
        parsed.error
      );
    }
    return this.sales.list(parsed.data, {
      actorId: request.auth!.id,
      role: request.auth!.role
    });
  }

  @Get(":id")
  @RequireAnyPermissions(Permission.SALE_READ_ALL, Permission.SALE_READ_OWN)
  get(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      throw this.validationError("รหัสรายการขายไม่ถูกต้อง", parsed.error);
    }
    return this.sales.get(parsed.data, {
      actorId: request.auth!.id,
      role: request.auth!.role
    });
  }

  @Post()
  @RequirePermissions(Permission.SALE_CREATE)
  create(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    const parsedBody = createSaleRequestSchema.safeParse(body);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedBody.success) {
      throw this.validationError("ข้อมูลรายการขายไม่ถูกต้อง", parsedBody.error);
    }
    if (!parsedKey.success) {
      throw this.validationError("ต้องระบุ Idempotency-Key", parsedKey.error);
    }
    return this.sales.create(parsedBody.data, {
      idempotencyKey: parsedKey.data,
      actorId: request.auth!.id,
      requestId: request.requestId
    });
  }

  @Post(":id/cancel")
  @RequirePermissions(Permission.SALE_CANCEL)
  cancel(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    const parsedId = idSchema.safeParse(id);
    const parsedBody = cancelSaleRequestSchema.safeParse(body);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedId.success) {
      throw this.validationError(
        "รหัสรายการขายไม่ถูกต้อง",
        parsedId.error
      );
    }
    if (!parsedBody.success) {
      throw this.validationError(
        "เหตุผลการยกเลิกบิลไม่ถูกต้อง",
        parsedBody.error
      );
    }
    if (!parsedKey.success) {
      throw this.validationError("ต้องระบุ Idempotency-Key", parsedKey.error);
    }
    return this.sales.cancel(parsedId.data, parsedBody.data, {
      idempotencyKey: parsedKey.data,
      actorId: request.auth!.id,
      role: request.auth!.role,
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
