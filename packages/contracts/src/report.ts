import { z } from "zod";

const pageSchema = z.coerce.number().int().positive().default(1);
const pageSizeSchema = z.coerce.number().int().positive().max(100).default(25);
const businessDateSchema = z.string().date();
const nonnegativeDecimalSchema = z.string().regex(/^\d+\.\d{2}$/);
const signedDecimalSchema = z.string().regex(/^-?\d+\.\d{2}$/);
const periodSchema = z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/);

const productIdentitySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string()
});

const customerIdentitySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  firstName: z.string(),
  lastName: z.string()
});

function validateDateRange(
  value: { dateFrom: string; dateTo: string },
  context: z.RefinementCtx
): void {
  if (value.dateFrom > value.dateTo) {
    context.addIssue({
      code: "custom",
      path: ["dateTo"],
      message: "dateTo must be on or after dateFrom"
    });
  }
}

export const reportGroupBySchema = z.enum(["day", "month", "year"]);

export const reportDateRangeQuerySchema = z
  .object({
    dateFrom: businessDateSchema,
    dateTo: businessDateSchema,
    groupBy: reportGroupBySchema.default("day"),
    page: pageSchema,
    pageSize: pageSizeSchema
  })
  .superRefine(validateDateRange);

export const customerReportQuerySchema = z
  .object({
    dateFrom: businessDateSchema,
    dateTo: businessDateSchema,
    page: pageSchema,
    pageSize: pageSizeSchema
  })
  .superRefine(validateDateRange);

export const inventoryReportQuerySchema = z.object({
  page: pageSchema,
  pageSize: pageSizeSchema
});

export const inventoryExpiryReportQuerySchema = inventoryReportQuerySchema.extend({
  status: z.enum(["expired", "expiring", "all"]).default("all"),
  daysAhead: z.coerce.number().int().positive().max(365).default(30),
  asOf: businessDateSchema.optional()
});

export const salesReportItemSchema = z.object({
  period: periodSchema,
  invoiceCount: z.number().int().nonnegative(),
  quantitySold: z.number().int().nonnegative(),
  totalSales: nonnegativeDecimalSchema
});

export const salesReportResponseSchema = z.object({
  items: z.array(salesReportItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totals: z.object({
    invoiceCount: z.number().int().nonnegative(),
    quantitySold: z.number().int().nonnegative(),
    totalSales: nonnegativeDecimalSchema
  })
});

export const grossProfitReportItemSchema = z.object({
  period: periodSchema,
  totalSales: nonnegativeDecimalSchema,
  totalCost: nonnegativeDecimalSchema,
  grossProfit: signedDecimalSchema
});

export const grossProfitReportResponseSchema = z.object({
  items: z.array(grossProfitReportItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totals: z.object({
    totalSales: nonnegativeDecimalSchema,
    totalCost: nonnegativeDecimalSchema,
    grossProfit: signedDecimalSchema
  })
});

export const inventoryCurrentReportItemSchema = z.object({
  product: productIdentitySchema,
  totalAvailable: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  inventoryValue: nonnegativeDecimalSchema
});

export const inventoryCurrentReportResponseSchema = z.object({
  items: z.array(inventoryCurrentReportItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totals: z.object({
    quantity: z.number().int().nonnegative(),
    inventoryValue: nonnegativeDecimalSchema
  })
});

export const inventoryLowStockReportItemSchema =
  inventoryCurrentReportItemSchema.extend({
    shortage: z.number().int().positive()
  });

export const inventoryLowStockReportResponseSchema = z.object({
  items: z.array(inventoryLowStockReportItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totals: z.object({
    quantity: z.number().int().nonnegative(),
    inventoryValue: nonnegativeDecimalSchema
  })
});

export const inventoryExpiryReportItemSchema = z.object({
  lot: z.object({
    id: z.string().uuid(),
    lotNumber: z.string()
  }),
  product: productIdentitySchema,
  expiryDate: z.string().datetime(),
  availableQuantity: z.number().int().positive(),
  unitCost: nonnegativeDecimalSchema,
  inventoryValue: nonnegativeDecimalSchema,
  status: z.enum(["EXPIRED", "EXPIRING_SOON"]),
  daysUntilExpiry: z.number().int()
});

export const inventoryExpiryReportResponseSchema = z.object({
  items: z.array(inventoryExpiryReportItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totals: z.object({
    quantity: z.number().int().nonnegative(),
    inventoryValue: nonnegativeDecimalSchema
  })
});

export const topCustomerReportItemSchema = z.object({
  customer: customerIdentitySchema,
  invoiceCount: z.number().int().positive(),
  quantitySold: z.number().int().positive(),
  totalSales: nonnegativeDecimalSchema,
  grossProfit: signedDecimalSchema
});

export const topCustomerReportResponseSchema = z.object({
  items: z.array(topCustomerReportItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative()
});

export const newCustomerReportItemSchema = z.object({
  customer: customerIdentitySchema,
  joinedAt: z.string().datetime()
});

export const newCustomerReportResponseSchema = z.object({
  items: z.array(newCustomerReportItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative()
});

export type ReportGroupBy = z.infer<typeof reportGroupBySchema>;
export type ReportDateRangeQuery = z.infer<typeof reportDateRangeQuerySchema>;
export type CustomerReportQuery = z.infer<typeof customerReportQuerySchema>;
export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>;
export type InventoryExpiryReportQuery = z.infer<
  typeof inventoryExpiryReportQuerySchema
>;
export type SalesReportResponse = z.infer<typeof salesReportResponseSchema>;
export type GrossProfitReportResponse = z.infer<
  typeof grossProfitReportResponseSchema
>;
export type InventoryCurrentReportResponse = z.infer<
  typeof inventoryCurrentReportResponseSchema
>;
export type InventoryLowStockReportResponse = z.infer<
  typeof inventoryLowStockReportResponseSchema
>;
export type InventoryExpiryReportResponse = z.infer<
  typeof inventoryExpiryReportResponseSchema
>;
export type TopCustomerReportResponse = z.infer<
  typeof topCustomerReportResponseSchema
>;
export type NewCustomerReportResponse = z.infer<
  typeof newCustomerReportResponseSchema
>;
