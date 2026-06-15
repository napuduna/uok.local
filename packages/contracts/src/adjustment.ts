import { z } from "zod";

import { createPaginatedResponseSchema } from "./pagination.js";

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .transform((value) => value.toUpperCase());

const identitySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string()
});

export const inventoryAdjustmentDirectionSchema = z.enum([
  "INCREASE",
  "DECREASE"
]);

export const createInventoryAdjustmentRequestSchema = z.object({
  referenceNumber: codeSchema,
  lotId: z.string().uuid(),
  direction: inventoryAdjustmentDirectionSchema,
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500)
});

export const inventoryAdjustmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25)
});

export const inventoryAdjustmentResponseSchema = z.object({
  id: z.string().uuid(),
  referenceNumber: z.string(),
  direction: inventoryAdjustmentDirectionSchema,
  quantity: z.number().int().positive(),
  quantityDelta: z.number().int(),
  reason: z.string(),
  product: identitySchema,
  lot: z.object({
    id: z.string().uuid(),
    lotNumber: z.string()
  }),
  warehouse: identitySchema,
  beforeQuantity: z.number().int().nonnegative(),
  afterQuantity: z.number().int().nonnegative(),
  createdBy: z.object({
    id: z.string().uuid(),
    name: z.string()
  }),
  createdAt: z.string().datetime()
});

export const paginatedInventoryAdjustmentsResponseSchema =
  createPaginatedResponseSchema(inventoryAdjustmentResponseSchema);

export type InventoryAdjustmentDirection = z.infer<
  typeof inventoryAdjustmentDirectionSchema
>;
export type CreateInventoryAdjustmentRequest = z.infer<
  typeof createInventoryAdjustmentRequestSchema
>;
export type InventoryAdjustmentListQuery = z.infer<
  typeof inventoryAdjustmentListQuerySchema
>;
export type InventoryAdjustmentResponse = z.infer<
  typeof inventoryAdjustmentResponseSchema
>;
export type PaginatedInventoryAdjustmentsResponse = z.infer<
  typeof paginatedInventoryAdjustmentsResponseSchema
>;
