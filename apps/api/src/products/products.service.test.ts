import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../database/database.service";
import { ProductsService } from "./products.service";

const productRecord = {
  id: "ac1d9514-b32e-4d03-865b-b46353705fe8",
  code: "P001",
  name: "สบู่สมุนไพร",
  category: {
    id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
    code: "HERBAL",
    name: "สมุนไพร"
  },
  unit: {
    id: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
    code: "PCS",
    name: "ชิ้น"
  },
  salePrice: { toFixed: () => "80.00" },
  lowStockThreshold: 50,
  isActive: true,
  archivedAt: null,
  createdAt: new Date("2026-06-15T03:00:00.000Z"),
  updatedAt: new Date("2026-06-15T03:00:00.000Z")
};

describe("ProductsService", () => {
  it("lists only active category master data by default", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
        code: "HERBAL",
        name: "สมุนไพร",
        isActive: true
      }
    ]);
    const database = {
      client: {
        category: { findMany }
      }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    await expect(service.listCategories()).resolves.toEqual([
      expect.objectContaining({ code: "HERBAL", isActive: true })
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, code: true, name: true, isActive: true }
    });
  });

  it("creates units and maps duplicate codes to conflict", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        id: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
        code: "PCS",
        name: "ชิ้น",
        isActive: true
      })
      .mockRejectedValueOnce({ code: "P2002" });
    const database = {
      client: { unit: { create } }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    await expect(
      service.createUnit({ code: "PCS", name: "ชิ้น" })
    ).resolves.toEqual(expect.objectContaining({ code: "PCS" }));
    await expect(
      service.createUnit({ code: "PCS", name: "ชิ้น" })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates and lists unit master data", async () => {
    const unit = {
      id: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
      code: "BOX",
      name: "กล่อง",
      isActive: true
    };
    const findMany = vi.fn().mockResolvedValue([unit]);
    const update = vi.fn().mockResolvedValue(unit);
    const database = {
      client: { unit: { findMany, update } }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    await expect(service.listUnits()).resolves.toEqual([unit]);
    await expect(
      service.updateUnit(unit.id, { code: "BOX", name: "กล่อง" })
    ).resolves.toEqual(unit);
  });

  it("creates and updates category master data", async () => {
    const category = {
      id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
      code: "HERBAL",
      name: "สมุนไพร",
      isActive: true
    };
    const create = vi.fn().mockResolvedValue(category);
    const update = vi.fn().mockResolvedValue(category);
    const database = {
      client: { category: { create, update } }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    await expect(
      service.createCategory({ code: "HERBAL", name: "สมุนไพร" })
    ).resolves.toEqual(category);
    await expect(
      service.updateCategory(category.id, { name: "สมุนไพร" })
    ).resolves.toEqual(category);
  });

  it("archives category master data without deleting it", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
      code: "HERBAL",
      name: "สมุนไพร",
      isActive: false
    });
    const deleteCategory = vi.fn();
    const database = {
      client: {
        category: { update, delete: deleteCategory }
      }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    const result = await service.archiveCategory(
      "1d2aa239-d7af-4ce2-96db-907bc57673bd"
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "1d2aa239-d7af-4ce2-96db-907bc57673bd" },
      data: { isActive: false, archivedAt: expect.any(Date) },
      select: { id: true, code: true, name: true, isActive: true }
    });
    expect(deleteCategory).not.toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });

  it("archives unit master data without deleting it", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
      code: "PCS",
      name: "ชิ้น",
      isActive: false
    });
    const database = {
      client: { unit: { update } }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    await expect(
      service.archiveUnit("f5420a40-bb3f-4e8b-9517-d47fa9819039")
    ).resolves.toEqual(expect.objectContaining({ isActive: false }));
  });

  it("lists active products with deterministic sorting and pagination", async () => {
    const findMany = vi.fn().mockResolvedValue([productRecord]);
    const count = vi.fn().mockResolvedValue(1);
    const database = {
      client: {
        product: { findMany, count }
      }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    const result = await service.list({
      page: 2,
      pageSize: 25,
      status: "active"
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        skip: 25,
        take: 25
      })
    );
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          code: "P001",
          salePrice: "80.00",
          isActive: true
        })
      ],
      page: 2,
      pageSize: 25,
      total: 1
    });
  });

  it("maps duplicate product codes to a conflict response", async () => {
    const database = {
      client: {
        product: {
          create: vi.fn().mockRejectedValue({ code: "P2002" })
        }
      }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    await expect(
      service.create({
        code: "P001",
        name: "สบู่สมุนไพร",
        categoryId: "1d2aa239-d7af-4ce2-96db-907bc57673bd",
        unitId: "f5420a40-bb3f-4e8b-9517-d47fa9819039",
        salePrice: "80.00",
        lowStockThreshold: 50
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("archives a product with an update and never deletes it", async () => {
    const update = vi.fn().mockResolvedValue({
      ...productRecord,
      isActive: false,
      archivedAt: new Date("2026-06-15T04:00:00.000Z"),
      updatedAt: new Date("2026-06-15T04:00:00.000Z")
    });
    const deleteProduct = vi.fn();
    const database = {
      client: {
        product: {
          findUnique: vi.fn().mockResolvedValue(productRecord),
          update,
          delete: deleteProduct
        },
        lot: { count: vi.fn().mockResolvedValue(0) }
      }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    const result = await service.archive(productRecord.id);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: productRecord.id },
        data: { isActive: false, archivedAt: expect.any(Date) }
      })
    );
    expect(deleteProduct).not.toHaveBeenCalled();
    expect(result.isActive).toBe(false);
  });

  it("blocks archive while a lot still has available stock", async () => {
    const update = vi.fn();
    const database = {
      client: {
        product: {
          findUnique: vi.fn().mockResolvedValue(productRecord),
          update
        },
        lot: { count: vi.fn().mockResolvedValue(1) }
      }
    } as unknown as DatabaseService;
    const service = new ProductsService(database);

    await expect(service.archive(productRecord.id)).rejects.toMatchObject({
      response: { code: "PRODUCT_HAS_AVAILABLE_STOCK" }
    });
    expect(update).not.toHaveBeenCalled();
  });
});
