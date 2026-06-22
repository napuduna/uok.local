import { z } from "zod";

const businessDateSchema = z.string().date();
const reportGroupBySchema = z.enum(["day", "month", "year"]);
const dateRangeFields = {
  dateFrom: businessDateSchema,
  dateTo: businessDateSchema
} as const;

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

const groupedDateRangeFiltersSchema = z
  .object({
    ...dateRangeFields,
    groupBy: reportGroupBySchema.default("day")
  })
  .superRefine(validateDateRange);

const dateRangeFiltersSchema = z
  .object(dateRangeFields)
  .superRefine(validateDateRange);

const inventoryFiltersSchema = z.object({}).strict();
const inventoryExpiryFiltersSchema = z
  .object({
    status: z.enum(["expired", "expiring", "all"]).default("all"),
    daysAhead: z.coerce.number().int().positive().max(365).default(30),
    asOf: businessDateSchema.optional()
  })
  .strict();

export const exportReportTypeSchema = z.enum([
  "SALES",
  "GROSS_PROFIT",
  "INVENTORY_CURRENT",
  "INVENTORY_LOW_STOCK",
  "INVENTORY_EXPIRY",
  "CUSTOMERS_TOP",
  "CUSTOMERS_NEW"
]);

export const exportFormatSchema = z.enum(["XLSX", "PDF"]);

export const exportJobStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "EXPIRED"
]);

export const createExportRequestSchema = z.discriminatedUnion("reportType", [
  z.object({
    reportType: z.literal("SALES"),
    format: exportFormatSchema,
    filters: groupedDateRangeFiltersSchema
  }),
  z.object({
    reportType: z.literal("GROSS_PROFIT"),
    format: exportFormatSchema,
    filters: groupedDateRangeFiltersSchema
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
    filters: inventoryExpiryFiltersSchema
  }),
  z.object({
    reportType: z.literal("CUSTOMERS_TOP"),
    format: exportFormatSchema,
    filters: dateRangeFiltersSchema
  }),
  z.object({
    reportType: z.literal("CUSTOMERS_NEW"),
    format: exportFormatSchema,
    filters: dateRangeFiltersSchema
  })
]);

export const exportListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25)
});

const exportCellSchema = z.union([z.string(), z.number()]);

export const exportSnapshotSchema = z.object({
  reportType: exportReportTypeSchema,
  title: z.string().min(1),
  generatedAt: z.string().datetime(),
  filters: z.record(z.string(), z.unknown()),
  columns: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        width: z.number().int().min(8).max(50)
      })
    )
    .min(1),
  rows: z.array(z.record(z.string(), exportCellSchema)),
  totals: z.record(z.string(), exportCellSchema)
});

export const exportQueuePayloadSchema = z.object({
  exportJobId: z.string().uuid()
});

export const exportJobResponseSchema = z.object({
  id: z.string().uuid(),
  reportType: exportReportTypeSchema,
  format: exportFormatSchema,
  status: exportJobStatusSchema,
  filters: z.record(z.string(), z.unknown()),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  expiresAt: z.string().datetime().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const paginatedExportJobsResponseSchema = z.object({
  items: z.array(exportJobResponseSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative()
});

export type CreateExportRequest = z.infer<typeof createExportRequestSchema>;
export type ExportReportType = z.infer<typeof exportReportTypeSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportJobStatus = z.infer<typeof exportJobStatusSchema>;
export type ExportListQuery = z.infer<typeof exportListQuerySchema>;
export type ExportSnapshot = z.infer<typeof exportSnapshotSchema>;
export type ExportQueuePayload = z.infer<typeof exportQueuePayloadSchema>;
export type ExportJobResponse = z.infer<typeof exportJobResponseSchema>;
export type PaginatedExportJobsResponse = z.infer<
  typeof paginatedExportJobsResponseSchema
>;
