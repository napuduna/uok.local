import { describe, expect, it } from "vitest";

import {
  createExportRequestSchema,
  exportJobResponseSchema
} from "./export";

describe("export contracts", () => {
  it("parses a sales export with deterministic report filters", () => {
    expect(
      createExportRequestSchema.parse({
        reportType: "SALES",
        format: "XLSX",
        filters: {
          dateFrom: "2026-02-01",
          dateTo: "2026-02-28",
          groupBy: "month"
        }
      })
    ).toEqual({
      reportType: "SALES",
      format: "XLSX",
      filters: {
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
        groupBy: "month"
      }
    });
  });

  it("rejects filters that do not belong to the selected report", () => {
    expect(() =>
      createExportRequestSchema.parse({
        reportType: "INVENTORY_CURRENT",
        format: "PDF",
        filters: {
          dateFrom: "2026-02-01",
          dateTo: "2026-02-28"
        }
      })
    ).toThrow();
  });

  it("rejects inverted export date ranges", () => {
    expect(() =>
      createExportRequestSchema.parse({
        reportType: "GROSS_PROFIT",
        format: "PDF",
        filters: {
          dateFrom: "2026-03-01",
          dateTo: "2026-02-28",
          groupBy: "day"
        }
      })
    ).toThrow();
  });

  it("validates completed artifact metadata without exposing its server path", () => {
    const result = exportJobResponseSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      reportType: "SALES",
      format: "XLSX",
      status: "COMPLETED",
      filters: {
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
        groupBy: "month"
      },
      fileName: "sales-00000000-0000-4000-8000-000000000001.xlsx",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileChecksum:
        "a".repeat(64),
      fileSizeBytes: 2048,
      expiresAt: "2026-06-21T00:00:00.000Z",
      completedAt: "2026-06-20T00:00:00.000Z",
      safeError: null,
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z"
    });

    expect(result.status).toBe("COMPLETED");
    expect(result).not.toHaveProperty("artifactPath");
  });
});
