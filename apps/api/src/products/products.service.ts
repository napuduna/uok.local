import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  CreateMasterDataRequest,
  CreateProductRequest,
  MasterDataResponse,
  PaginatedProductsResponse,
  ProductListQuery,
  ProductResponse,
  UpdateMasterDataRequest,
  UpdateProductRequest
} from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";

const productInclude = {
  category: { select: { id: true, code: true, name: true } },
  unit: { select: { id: true, code: true, name: true } }
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

function mapProduct(product: ProductRecord): ProductResponse {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    category: product.category,
    unit: product.unit,
    salePrice: product.salePrice.toFixed(2),
    lowStockThreshold: product.lowStockThreshold,
    isActive: product.isActive,
    archivedAt: product.archivedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

@Injectable()
export class ProductsService {
  constructor(private readonly database: DatabaseService) {}

  listCategories(): Promise<MasterDataResponse[]> {
    return this.database.client.category.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, code: true, name: true, isActive: true }
    });
  }

  listUnits(): Promise<MasterDataResponse[]> {
    return this.database.client.unit.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, code: true, name: true, isActive: true }
    });
  }

  async createCategory(
    input: CreateMasterDataRequest
  ): Promise<MasterDataResponse> {
    try {
      return await this.database.client.category.create({
        data: input,
        select: { id: true, code: true, name: true, isActive: true }
      });
    } catch (error) {
      this.rethrowMasterDataError(error, "CATEGORY");
    }
  }

  async updateCategory(
    id: string,
    input: UpdateMasterDataRequest
  ): Promise<MasterDataResponse> {
    try {
      return await this.database.client.category.update({
        where: { id },
        data: {
          ...(input.code ? { code: input.code } : {}),
          ...(input.name ? { name: input.name } : {})
        },
        select: { id: true, code: true, name: true, isActive: true }
      });
    } catch (error) {
      this.rethrowMasterDataError(error, "CATEGORY");
    }
  }

  async archiveCategory(id: string): Promise<MasterDataResponse> {
    try {
      return await this.database.client.category.update({
        where: { id },
        data: { isActive: false, archivedAt: new Date() },
        select: { id: true, code: true, name: true, isActive: true }
      });
    } catch (error) {
      this.rethrowMasterDataError(error, "CATEGORY");
    }
  }

  async createUnit(
    input: CreateMasterDataRequest
  ): Promise<MasterDataResponse> {
    try {
      return await this.database.client.unit.create({
        data: input,
        select: { id: true, code: true, name: true, isActive: true }
      });
    } catch (error) {
      this.rethrowMasterDataError(error, "UNIT");
    }
  }

  async updateUnit(
    id: string,
    input: UpdateMasterDataRequest
  ): Promise<MasterDataResponse> {
    try {
      return await this.database.client.unit.update({
        where: { id },
        data: {
          ...(input.code ? { code: input.code } : {}),
          ...(input.name ? { name: input.name } : {})
        },
        select: { id: true, code: true, name: true, isActive: true }
      });
    } catch (error) {
      this.rethrowMasterDataError(error, "UNIT");
    }
  }

  async archiveUnit(id: string): Promise<MasterDataResponse> {
    try {
      return await this.database.client.unit.update({
        where: { id },
        data: { isActive: false, archivedAt: new Date() },
        select: { id: true, code: true, name: true, isActive: true }
      });
    } catch (error) {
      this.rethrowMasterDataError(error, "UNIT");
    }
  }

  async list(query: ProductListQuery): Promise<PaginatedProductsResponse> {
    const where: Prisma.ProductWhereInput = {
      ...(query.status === "active"
        ? { isActive: true }
        : query.status === "archived"
          ? { isActive: false }
          : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.database.client.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ code: "asc" }, { id: "asc" }],
        skip,
        take: query.pageSize
      }),
      this.database.client.product.count({ where })
    ]);

    return {
      items: items.map(mapProduct),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async get(id: string): Promise<ProductResponse> {
    const product = await this.database.client.product.findUnique({
      where: { id },
      include: productInclude
    });
    if (!product) {
      throw this.notFound();
    }
    return mapProduct(product);
  }

  async create(input: CreateProductRequest): Promise<ProductResponse> {
    try {
      const product = await this.database.client.product.create({
        data: {
          code: input.code,
          name: input.name,
          categoryId: input.categoryId,
          unitId: input.unitId,
          salePrice: new Prisma.Decimal(input.salePrice),
          lowStockThreshold: input.lowStockThreshold
        },
        include: productInclude
      });
      return mapProduct(product);
    } catch (error) {
      this.rethrowMutationError(error);
    }
  }

  async update(
    id: string,
    input: UpdateProductRequest
  ): Promise<ProductResponse> {
    try {
      const product = await this.database.client.product.update({
        where: { id },
        data: {
          ...(input.code ? { code: input.code } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.unitId ? { unitId: input.unitId } : {}),
          ...(input.salePrice
            ? { salePrice: new Prisma.Decimal(input.salePrice) }
            : {}),
          ...(input.lowStockThreshold !== undefined
            ? { lowStockThreshold: input.lowStockThreshold }
            : {})
        },
        include: productInclude
      });
      return mapProduct(product);
    } catch (error) {
      this.rethrowMutationError(error);
    }
  }

  async archive(id: string): Promise<ProductResponse> {
    const existing = await this.database.client.product.findUnique({
      where: { id },
      include: productInclude
    });
    if (!existing) {
      throw this.notFound();
    }
    if (!existing.isActive) {
      return mapProduct(existing);
    }
    const availableLotCount = await this.database.client.lot.count({
      where: {
        productId: id,
        isActive: true,
        availableQuantity: { gt: 0 }
      }
    });
    if (availableLotCount > 0) {
      throw new ConflictException({
        code: "PRODUCT_HAS_AVAILABLE_STOCK",
        message: "ไม่สามารถเก็บสินค้าเข้าประวัติขณะที่ยังมีสต๊อกคงเหลือ"
      });
    }

    const product = await this.database.client.product.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
      include: productInclude
    });
    return mapProduct(product);
  }

  private rethrowMutationError(error: unknown): never {
    if (hasPrismaCode(error, "P2002")) {
      throw new ConflictException({
        code: "PRODUCT_CODE_CONFLICT",
        message: "รหัสสินค้านี้ถูกใช้งานแล้ว"
      });
    }
    if (hasPrismaCode(error, "P2003")) {
      throw new NotFoundException({
        code: "PRODUCT_MASTER_DATA_NOT_FOUND",
        message: "ไม่พบหมวดหมู่หรือหน่วยสินค้าที่เลือก"
      });
    }
    if (hasPrismaCode(error, "P2025")) {
      throw this.notFound();
    }
    throw error;
  }

  private rethrowMasterDataError(
    error: unknown,
    resource: "CATEGORY" | "UNIT"
  ): never {
    if (hasPrismaCode(error, "P2002")) {
      throw new ConflictException({
        code: `${resource}_CODE_CONFLICT`,
        message:
          resource === "CATEGORY"
            ? "รหัสหมวดหมู่นี้ถูกใช้งานแล้ว"
            : "รหัสหน่วยนี้ถูกใช้งานแล้ว"
      });
    }
    if (hasPrismaCode(error, "P2025")) {
      throw new NotFoundException({
        code: `${resource}_NOT_FOUND`,
        message: resource === "CATEGORY" ? "ไม่พบหมวดหมู่" : "ไม่พบหน่วยสินค้า"
      });
    }
    throw error;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "PRODUCT_NOT_FOUND",
      message: "ไม่พบสินค้า"
    });
  }
}
