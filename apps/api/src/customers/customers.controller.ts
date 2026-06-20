import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import {
  createCustomerRequestSchema,
  customerListQuerySchema,
  customerPurchaseHistoryQuerySchema,
  Permission,
  updateCustomerRequestSchema
} from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CustomersService } from "./customers.service";

const idSchema = z.string().uuid();

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message,
      details: parsed.error.flatten()
    });
  }
  return parsed.data;
}

@Controller("customers")
@UseGuards(SessionAuthGuard, PermissionGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(Permission.CUSTOMER_READ)
  list(@Query() query: Record<string, unknown>) {
    return this.customers.list(
      parseOrThrow(
        customerListQuerySchema,
        query,
        "ตัวกรองรายการลูกค้าไม่ถูกต้อง"
      )
    );
  }

  @Post()
  @RequirePermissions(Permission.CUSTOMER_MANAGE)
  create(@Body() body: unknown) {
    return this.customers.create(
      parseOrThrow(createCustomerRequestSchema, body, "ข้อมูลลูกค้าไม่ถูกต้อง")
    );
  }

  @Get(":id")
  @RequirePermissions(Permission.CUSTOMER_READ)
  get(@Param("id") id: string) {
    return this.customers.get(this.parseId(id));
  }

  @Patch(":id")
  @RequirePermissions(Permission.CUSTOMER_MANAGE)
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.customers.update(
      this.parseId(id),
      parseOrThrow(updateCustomerRequestSchema, body, "ข้อมูลลูกค้าไม่ถูกต้อง")
    );
  }

  @Patch(":id/archive")
  @RequirePermissions(Permission.CUSTOMER_MANAGE)
  archive(@Param("id") id: string) {
    return this.customers.archive(this.parseId(id));
  }

  @Get(":id/purchase-history")
  @RequirePermissions(Permission.CUSTOMER_READ)
  purchaseHistory(
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    return this.customers.purchaseHistory(
      this.parseId(id),
      parseOrThrow(
        customerPurchaseHistoryQuerySchema,
        query,
        "ตัวกรองประวัติการซื้อไม่ถูกต้อง"
      ),
      {
        actorId: request.auth!.id,
        role: request.auth!.role
      }
    );
  }

  private parseId(value: string): string {
    return parseOrThrow(idSchema, value, "รหัสลูกค้าไม่ถูกต้อง");
  }
}
