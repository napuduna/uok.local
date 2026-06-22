import { z } from "zod";

import { createPaginatedResponseSchema } from "./pagination.js";
import { thbDecimalSchema } from "./product.js";

const fixedDecimalSchema = z.string().regex(/^\d+\.\d{2}$/);
const signedFixedDecimalSchema = z.string().regex(/^-?\d+\.\d{2}$/);

export const saleStatusSchema = z.enum(["COMPLETED", "CANCELLED"]);

export const createSaleItemRequestSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: thbDecimalSchema
});

export const createSaleRequestSchema = z
  .object({
    customerId: z.string().uuid(),
    warehouseId: z.string().uuid().optional(),
    items: z.array(createSaleItemRequestSchema).min(1).max(100)
  })
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.productId)).size ===
      value.items.length,
    {
      message: "Duplicate products are not allowed",
      path: ["items"]
    }
  );

export const cancelSaleRequestSchema = z.object({
  reason: z.string().trim().min(3).max(1000)
});

export const saleListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  customerId: z.string().uuid().optional(),
  invoiceNumber: z.string().trim().min(1).max(100).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  status: z.enum(["completed", "cancelled", "all"]).default("all")
});

export const saleCatalogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().min(1).max(200).optional()
});

export const saleCatalogItemSchema = z.object({
  product: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string()
  }),
  unit: z.object({
    code: z.string(),
    name: z.string()
  }),
  salePrice: fixedDecimalSchema,
  totalAvailable: z.number().int().nonnegative()
});

export const paginatedSaleCatalogResponseSchema =
  createPaginatedResponseSchema(saleCatalogItemSchema);

const salePartySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  firstName: z.string(),
  lastName: z.string()
});

const identitySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string()
});

export const saleAllocationResponseSchema = z.object({
  id: z.string().uuid(),
  lotId: z.string().uuid(),
  lotNumber: z.string(),
  quantity: z.number().int().positive(),
  unitCost: fixedDecimalSchema,
  costSubtotal: fixedDecimalSchema
});

export const saleItemResponseSchema = z.object({
  id: z.string().uuid(),
  product: identitySchema,
  quantity: z.number().int().positive(),
  unitPrice: fixedDecimalSchema,
  salesSubtotal: fixedDecimalSchema,
  costSubtotal: fixedDecimalSchema,
  grossProfit: signedFixedDecimalSchema,
  allocations: z.array(saleAllocationResponseSchema).min(1)
});

export const saleResponseSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  status: saleStatusSchema,
  soldAt: z.string().datetime(),
  customer: salePartySchema,
  warehouse: identitySchema,
  createdBy: z.object({
    id: z.string().uuid(),
    name: z.string()
  }),
  totalSales: fixedDecimalSchema,
  totalCost: fixedDecimalSchema,
  grossProfit: signedFixedDecimalSchema,
  cancellationReason: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  items: z.array(saleItemResponseSchema).min(1)
});

export const paginatedSalesResponseSchema =
  createPaginatedResponseSchema(saleResponseSchema);

export type CreateSaleRequest = z.infer<typeof createSaleRequestSchema>;
export type CancelSaleRequest = z.infer<typeof cancelSaleRequestSchema>;
export type SaleCatalogQuery = z.infer<typeof saleCatalogQuerySchema>;
export type SaleCatalogItem = z.infer<typeof saleCatalogItemSchema>;
export type PaginatedSaleCatalogResponse = z.infer<
  typeof paginatedSaleCatalogResponseSchema
>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
export type SaleStatus = z.infer<typeof saleStatusSchema>;
export type SaleResponse = z.infer<typeof saleResponseSchema>;
export type PaginatedSalesResponse = z.infer<
  typeof paginatedSalesResponseSchema
>;
