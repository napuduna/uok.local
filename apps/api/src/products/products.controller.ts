import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import {
  createMasterDataRequestSchema,
  createProductRequestSchema,
  Permission,
  productListQuerySchema,
  updateMasterDataRequestSchema,
  updateProductRequestSchema
} from "@warehouse/contracts";

import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ProductsService } from "./products.service";

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

@Controller("products")
@UseGuards(SessionAuthGuard, PermissionGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("categories")
  @RequirePermissions(Permission.PRODUCT_READ)
  listCategories() {
    return this.products.listCategories();
  }

  @Post("categories")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  createCategory(@Body() body: unknown) {
    return this.products.createCategory(
      parseOrThrow(
        createMasterDataRequestSchema,
        body,
        "ข้อมูลหมวดหมู่ไม่ถูกต้อง"
      )
    );
  }

  @Patch("categories/:id")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  updateCategory(@Param("id") id: string, @Body() body: unknown) {
    return this.products.updateCategory(
      this.parseId(id),
      parseOrThrow(
        updateMasterDataRequestSchema,
        body,
        "ข้อมูลหมวดหมู่ไม่ถูกต้อง"
      )
    );
  }

  @Patch("categories/:id/archive")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  archiveCategory(@Param("id") id: string) {
    return this.products.archiveCategory(this.parseId(id));
  }

  @Get("units")
  @RequirePermissions(Permission.PRODUCT_READ)
  listUnits() {
    return this.products.listUnits();
  }

  @Post("units")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  createUnit(@Body() body: unknown) {
    return this.products.createUnit(
      parseOrThrow(
        createMasterDataRequestSchema,
        body,
        "ข้อมูลหน่วยสินค้าไม่ถูกต้อง"
      )
    );
  }

  @Patch("units/:id")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  updateUnit(@Param("id") id: string, @Body() body: unknown) {
    return this.products.updateUnit(
      this.parseId(id),
      parseOrThrow(
        updateMasterDataRequestSchema,
        body,
        "ข้อมูลหน่วยสินค้าไม่ถูกต้อง"
      )
    );
  }

  @Patch("units/:id/archive")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  archiveUnit(@Param("id") id: string) {
    return this.products.archiveUnit(this.parseId(id));
  }

  @Get()
  @RequirePermissions(Permission.PRODUCT_READ)
  list(@Query() query: Record<string, unknown>) {
    return this.products.list(
      parseOrThrow(
        productListQuerySchema,
        query,
        "ตัวกรองรายการสินค้าไม่ถูกต้อง"
      )
    );
  }

  @Post()
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  create(@Body() body: unknown) {
    return this.products.create(
      parseOrThrow(createProductRequestSchema, body, "ข้อมูลสินค้าไม่ถูกต้อง")
    );
  }

  @Get(":id")
  @RequirePermissions(Permission.PRODUCT_READ)
  get(@Param("id") id: string) {
    return this.products.get(this.parseId(id));
  }

  @Patch(":id")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.products.update(
      this.parseId(id),
      parseOrThrow(updateProductRequestSchema, body, "ข้อมูลสินค้าไม่ถูกต้อง")
    );
  }

  @Patch(":id/archive")
  @RequirePermissions(Permission.PRODUCT_MANAGE)
  archive(@Param("id") id: string) {
    return this.products.archive(this.parseId(id));
  }

  private parseId(value: string): string {
    return parseOrThrow(idSchema, value, "รหัสข้อมูลไม่ถูกต้อง");
  }
}
