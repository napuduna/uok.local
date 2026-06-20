import { z } from "zod";

import { createPaginatedResponseSchema } from "./pagination.js";

const productIdentitySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string()
});

const warehouseIdentitySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string()
});

export const inventoryMovementTypeSchema = z.enum([
  "STOCK_IN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "SALE_OUT",
  "SALE_CANCELLATION_IN"
]);

export const lotListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  warehouseId: z.string().uuid().optional(),
  status: z.enum(["active", "archived", "all"]).default("active")
});

export const lotResponseSchema = z.object({
  id: z.string().uuid(),
  lotNumber: z.string().min(1).max(100),
  product: productIdentitySchema,
  warehouse: warehouseIdentitySchema,
  receivedAt: z.string().datetime(),
  expiryDate: z.string().datetime().nullable(),
  unitCost: z.string().regex(/^\d+\.\d{2}$/),
  receivedQuantity: z.number().int().positive(),
  received: z.number().int().nonnegative(),
  sold: z.number().int().nonnegative(),
  adjusted: z.number().int(),
  availableQuantity: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.string().datetime()
});

export const paginatedLotsResponseSchema =
  createPaginatedResponseSchema(lotResponseSchema);

export const stockSummaryResponseSchema = z.object({
  product: productIdentitySchema,
  warehouse: warehouseIdentitySchema,
  totalAvailable: z.number().int().nonnegative(),
  activeLotCount: z.number().int().nonnegative()
});

export const reconciliationItemSchema = z.object({
  lotId: z.string().uuid(),
  lotNumber: z.string(),
  availableQuantity: z.number().int().nonnegative(),
  movementTotal: z.number().int(),
  difference: z.number().int(),
  isBalanced: z.boolean()
});

export const reconciliationResponseSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  isBalanced: z.boolean(),
  items: z.array(reconciliationItemSchema)
});

export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;
export type LotListQuery = z.infer<typeof lotListQuerySchema>;
export type LotResponse = z.infer<typeof lotResponseSchema>;
export type PaginatedLotsResponse = z.infer<typeof paginatedLotsResponseSchema>;
export type StockSummaryResponse = z.infer<typeof stockSummaryResponseSchema>;
export type ReconciliationResponse = z.infer<
  typeof reconciliationResponseSchema
>;
