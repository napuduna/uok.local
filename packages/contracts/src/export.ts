import { z } from "zod";

const businessDateSchema = z.string().date();
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);

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

export const exportFormatSchema = z.enum(["XLSX", "PDF"]);
export const exportReportTypeSchema = z.enum([
  "SALES",
  "GROSS_PROFIT",
  "INVENTORY_CURRENT",
  "INVENTORY_LOW_STOCK",
  "INVENTORY_EXPIRY",
  "TOP_CUSTOMERS",
  "NEW_CUSTOMERS"
]);
export const exportJobStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "EXPIRED"
]);

const dateRangeFiltersSchema = z
  .object({
    dateFrom: businessDateSchema,
    dateTo: businessDateSchema,
    groupBy: z.enum(["day", "month", "year"]).default("day")
  })
  .strict()
  .superRefine(validateDateRange);

const customerFiltersSchema = z
  .object({
    dateFrom: businessDateSchema,
    dateTo: businessDateSchema
  })
  .strict()
  .superRefine(validateDateRange);

const inventoryFiltersSchema = z.object({}).strict();

const expiryFiltersSchema = z
  .object({
    status: z.enum(["expired", "expiring", "all"]).default("all"),
    daysAhead: z.coerce.number().int().positive().max(365).default(30),
    asOf: businessDateSchema.optional()
  })
  .strict();

export const createExportRequestSchema = z.discriminatedUnion("reportType", [
  z.object({
    reportType: z.literal("SALES"),
    format: exportFormatSchema,
    filters: dateRangeFiltersSchema
  }),
  z.object({
    reportType: z.literal("GROSS_PROFIT"),
    format: exportFormatSchema,
    filters: dateRangeFiltersSchema
  }),
  z.object({
    reportType: z.literal("INVENTORY_CURRENT"),
    format: exportFormatSchema,
    filters: inventoryFiltersSchema
  }),
  z.object({
    reportType: z.literal("INVENTORY_LOW_STOCK"),
    format: exportFormatSchema,
    filters: inventoryFiltersSchema
  }),
  z.object({
    reportType: z.literal("INVENTORY_EXPIRY"),
    format: exportFormatSchema,
    filters: expiryFiltersSchema
  }),
  z.object({
    reportType: z.literal("TOP_CUSTOMERS"),
    format: exportFormatSchema,
    filters: customerFiltersSchema
  }),
  z.object({
    reportType: z.literal("NEW_CUSTOMERS"),
    format: exportFormatSchema,
    filters: customerFiltersSchema
  })
]);

export const exportJobResponseSchema = z.object({
  id: z.string().uuid(),
  reportType: exportReportTypeSchema,
  format: exportFormatSchema,
  status: exportJobStatusSchema,
  filters: z.record(z.string(), z.unknown()),
  fileName: z.string().nullable(),
  contentType: z.string().nullable(),
  fileChecksum: checksumSchema.nullable(),
  fileSizeBytes: z.number().int().nonnegative().nullable(),
  expiresAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  safeError: z
    .object({
      code: z.string(),
      message: z.string()
    })
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type CreateExportRequest = z.infer<typeof createExportRequestSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportJobResponse = z.infer<typeof exportJobResponseSchema>;
export type ExportJobStatus = z.infer<typeof exportJobStatusSchema>;
export type ExportReportType = z.infer<typeof exportReportTypeSchema>;
