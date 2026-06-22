import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { Permission } from "@warehouse/contracts";

import { REQUIRED_PERMISSIONS_KEY } from "../auth/require-permission.decorator";
import { ProductsController } from "./products.controller";
import type { ProductsService } from "./products.service";

function getControllerMethod(name: "create" | "archive"): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    ProductsController.prototype,
    name
  );
  if (!descriptor || typeof descriptor.value !== "function") {
    throw new Error(`Missing controller method: ${name}`);
  }
  return descriptor.value as object;
}

describe("ProductsController", () => {
  it("parses product list query strings before calling the service", async () => {
    const list = vi.fn().mockResolvedValue({
      items: [],
      page: 2,
      pageSize: 25,
      total: 0
    });
    const controller = new ProductsController({
      list
    } as unknown as ProductsService);

    await controller.list({
      page: "2",
      pageSize: "25",
      search: " P001 ",
      status: "active"
    });

    expect(list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      search: "P001",
      status: "active"
    });
  });

  it("rejects invalid product payloads at the API boundary", () => {
    const controller = new ProductsController({} as ProductsService);

    expect(() =>
      controller.create({
        code: "P001",
        name: "สินค้า",
        categoryId: "not-a-uuid",
        unitId: "not-a-uuid",
        salePrice: 80
      })
    ).toThrow(BadRequestException);
  });

  it("requires product management permission for mutations", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        getControllerMethod("create")
      )
    ).toEqual([Permission.PRODUCT_MANAGE]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        getControllerMethod("archive")
      )
    ).toEqual([Permission.PRODUCT_MANAGE]);
  });
});
