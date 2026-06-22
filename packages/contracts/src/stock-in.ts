import { z } from "zod";

import { createPaginatedResponseSchema } from "./pagination.js";
import { thbDecimalSchema } from "./product.js";

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

const stockInItemRequestSchema = z.object({
  productId: z.string().uuid(),
  lotNumber: codeSchema,
  expiryDate: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  quantity: z.number().int().positive(),
  unitCost: thbDecimalSchema
});

export const createStockInRequestSchema = z
  .object({
    referenceNumber: codeSchema,
    warehouseId: z.string().uuid().optional(),
    receivedAt: z.string().datetime({ offset: true }),
    items: z.array(stockInItemRequestSchema).min(1).max(100)
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    const receivedAt = new Date(value.receivedAt).getTime();
    value.items.forEach((item, index) => {
      const key = `${item.productId}:${item.lotNumber}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "lotNumber"],
          message: "Duplicate product and lot number"
        });
      }
      seen.add(key);
      if (item.expiryDate && new Date(item.expiryDate).getTime() < receivedAt) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "expiryDate"],
          message: "Expiry date must not be before received date"
        });
      }
    });
  });

export const stockInListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25)
});

export const stockInResponseSchema = z.object({
  id: z.string().uuid(),
  referenceNumber: z.string(),
  warehouse: identitySchema,
  receivedAt: z.string().datetime(),
  createdBy: z.object({
    id: z.string().uuid(),
    name: z.string()
  }),
  createdAt: z.string().datetime(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      product: identitySchema,
      lotId: z.string().uuid(),
      lotNumber: z.string(),
      expiryDate: z.string().datetime().nullable(),
      quantity: z.number().int().positive(),
      availableQuantity: z.number().int().nonnegative(),
      unitCost: z.string().regex(/^\d+\.\d{2}$/)
    })
  )
});

export const paginatedStockInsResponseSchema = createPaginatedResponseSchema(
  stockInResponseSchema
);

export type CreateStockInRequest = z.infer<typeof createStockInRequestSchema>;
export type StockInListQuery = z.infer<typeof stockInListQuerySchema>;
export type StockInResponse = z.infer<typeof stockInResponseSchema>;
export type PaginatedStockInsResponse = z.infer<
  typeof paginatedStockInsResponseSchema
>;
