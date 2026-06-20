import { z } from "zod";

import { createPaginatedResponseSchema } from "./pagination.js";

const customerCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .transform((value) => value.toUpperCase());
const customerNameSchema = z.string().trim().min(1).max(200);
const addressSchema = z.string().trim().max(1000);
const phoneSchema = z.string().trim().max(50);

export const customerGenderSchema = z.enum([
  "MALE",
  "FEMALE",
  "OTHER",
  "UNSPECIFIED"
]);

export const createCustomerRequestSchema = z.object({
  code: customerCodeSchema,
  firstName: customerNameSchema,
  lastName: customerNameSchema,
  age: z.number().int().min(0).max(150),
  gender: customerGenderSchema,
  address: addressSchema,
  phone: phoneSchema,
  joinedAt: z.string().datetime()
});

export const updateCustomerRequestSchema = createCustomerRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["active", "archived", "all"]).default("active")
});

export const customerResponseSchema = z.object({
  id: z.string().uuid(),
  code: customerCodeSchema,
  firstName: customerNameSchema,
  lastName: customerNameSchema,
  age: z.number().int().min(0).max(150),
  gender: customerGenderSchema,
  address: addressSchema,
  phone: phoneSchema,
  joinedAt: z.string().datetime(),
  isActive: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const paginatedCustomersResponseSchema = createPaginatedResponseSchema(
  customerResponseSchema
);

export const customerPurchaseHistoryItemSchema = z.object({
  saleId: z.string().uuid(),
  invoiceNumber: z.string(),
  soldAt: z.string().datetime(),
  status: z.enum(["COMPLETED", "CANCELLED"]),
  itemCount: z.number().int().positive(),
  totalSales: z.string().regex(/^\d+\.\d{2}$/),
  totalCost: z.string().regex(/^\d+\.\d{2}$/),
  grossProfit: z.string().regex(/^-?\d+\.\d{2}$/)
});

export const customerPurchaseHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25)
});

export const customerPurchaseHistoryResponseSchema = z.object({
  customer: customerResponseSchema,
  summary: z.object({
    orderCount: z.number().int().nonnegative(),
    totalSales: z.string().regex(/^\d+\.\d{2}$/),
    totalCost: z.string().regex(/^\d+\.\d{2}$/),
    grossProfit: z.string().regex(/^-?\d+\.\d{2}$/)
  }),
  items: z.array(customerPurchaseHistoryItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative()
});

export type CustomerGender = z.infer<typeof customerGenderSchema>;
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type CustomerResponse = z.infer<typeof customerResponseSchema>;
export type PaginatedCustomersResponse = z.infer<
  typeof paginatedCustomersResponseSchema
>;
export type CustomerPurchaseHistoryQuery = z.infer<
  typeof customerPurchaseHistoryQuerySchema
>;
export type CustomerPurchaseHistoryResponse = z.infer<
  typeof customerPurchaseHistoryResponseSchema
>;
