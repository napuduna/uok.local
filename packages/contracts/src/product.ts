import { z } from "zod";

import { createPaginatedResponseSchema } from "./pagination.js";

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((value) => value.toUpperCase());

const nameSchema = z.string().trim().min(1).max(200);

export const thbDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
  .refine((value) => value !== "0" && value !== "0.0" && value !== "0.00", {
    message: "Amount must be greater than zero"
  });

export const masterDataResponseSchema = z.object({
  id: z.string().uuid(),
  code: codeSchema,
  name: nameSchema,
  isActive: z.boolean()
});

export const masterDataListResponseSchema = z.array(masterDataResponseSchema);

export const createMasterDataRequestSchema = z.object({
  code: codeSchema,
  name: nameSchema
});

export const updateMasterDataRequestSchema = createMasterDataRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const createProductRequestSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  categoryId: z.string().uuid(),
  unitId: z.string().uuid(),
  salePrice: thbDecimalSchema,
  lowStockThreshold: z.number().int().nonnegative().default(50)
});

export const updateProductRequestSchema = createProductRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  status: z.enum(["active", "archived", "all"]).default("active")
});

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  code: codeSchema,
  name: nameSchema,
  category: masterDataResponseSchema.omit({ isActive: true }),
  unit: masterDataResponseSchema.omit({ isActive: true }),
  salePrice: z.string().regex(/^\d+\.\d{2}$/),
  lowStockThreshold: z.number().int().nonnegative(),
  isActive: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const paginatedProductsResponseSchema = createPaginatedResponseSchema(
  productResponseSchema
);

export type CreateMasterDataRequest = z.infer<
  typeof createMasterDataRequestSchema
>;
export type UpdateMasterDataRequest = z.infer<
  typeof updateMasterDataRequestSchema
>;
export type MasterDataResponse = z.infer<typeof masterDataResponseSchema>;
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type ProductResponse = z.infer<typeof productResponseSchema>;
export type PaginatedProductsResponse = z.infer<
  typeof paginatedProductsResponseSchema
>;
