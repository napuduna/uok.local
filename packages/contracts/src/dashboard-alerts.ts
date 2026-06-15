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

export const lowStockAlertListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25)
});

export const lowStockAlertResponseSchema = z.object({
  product: productIdentitySchema,
  totalAvailable: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  shortage: z.number().int().positive()
});

export const paginatedLowStockAlertsResponseSchema =
  createPaginatedResponseSchema(lowStockAlertResponseSchema);

export const expiryAlertStatusSchema = z.enum(["EXPIRED", "EXPIRING_SOON"]);

export const expiryAlertListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
  status: z.enum(["expired", "expiring", "all"]).default("all"),
  daysAhead: z.coerce.number().int().positive().max(365).default(30)
});

export const expiryAlertResponseSchema = z.object({
  lot: z.object({
    id: z.string().uuid(),
    lotNumber: z.string()
  }),
  product: productIdentitySchema,
  expiryDate: z.string().datetime(),
  availableQuantity: z.number().int().positive(),
  status: expiryAlertStatusSchema,
  daysUntilExpiry: z.number().int()
});

export const paginatedExpiryAlertsResponseSchema =
  createPaginatedResponseSchema(expiryAlertResponseSchema);

export const dashboardAlertsResponseSchema = z.object({
  warehouse: warehouseIdentitySchema,
  lowStockCount: z.number().int().nonnegative(),
  expiredLotCount: z.number().int().nonnegative(),
  expiringSoonLotCount: z.number().int().nonnegative(),
  lowStockItems: z.array(lowStockAlertResponseSchema),
  expiryItems: z.array(expiryAlertResponseSchema)
});

export type LowStockAlertListQuery = z.infer<
  typeof lowStockAlertListQuerySchema
>;
export type LowStockAlertResponse = z.infer<typeof lowStockAlertResponseSchema>;
export type PaginatedLowStockAlertsResponse = z.infer<
  typeof paginatedLowStockAlertsResponseSchema
>;
export type ExpiryAlertListQuery = z.infer<typeof expiryAlertListQuerySchema>;
export type ExpiryAlertResponse = z.infer<typeof expiryAlertResponseSchema>;
export type PaginatedExpiryAlertsResponse = z.infer<
  typeof paginatedExpiryAlertsResponseSchema
>;
export type DashboardAlertsResponse = z.infer<
  typeof dashboardAlertsResponseSchema
>;
