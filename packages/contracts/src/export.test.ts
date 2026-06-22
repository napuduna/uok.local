import { describe, expect, it } from "vitest";

import {
  createExportRequestSchema,
  exportJobResponseSchema,
  exportSnapshotSchema
} from "./export";

describe("export contracts", () => {
  it("validates a grouped sales export request", () => {
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
    ).toMatchObject({
      reportType: "SALES",
      format: "XLSX",
      filters: { groupBy: "month" }
    });
  });

  it("rejects filters that do not match the report type", () => {
    expect(() =>
      createExportRequestSchema.parse({
        reportType: "INVENTORY_CURRENT",
        format: "PDF",
        filters: { dateFrom: "2026-02-01" }
      })
    ).toThrow();
  });

  it("validates a persisted export job and generic report snapshot", () => {
    const snapshot = exportSnapshotSchema.parse({
      reportType: "SALES",
      title: "รายงานยอดขาย",
      generatedAt: "2026-02-28T17:00:00.000Z",
      filters: { dateFrom: "2026-02-01", dateTo: "2026-02-28" },
      columns: [
        { key: "period", label: "ช่วงเวลา", width: 18 },
        { key: "totalSales", label: "ยอดขาย", width: 18 }
      ],
      rows: [{ period: "2026-02", totalSales: "300.00" }],
      totals: { totalSales: "300.00" }
    });

    const job = exportJobResponseSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      reportType: "SALES",
      format: "XLSX",
      status: "COMPLETED",
      filters: snapshot.filters,
      fileName: "sales.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      checksum:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sizeBytes: 1024,
      expiresAt: "2026-03-07T17:00:00.000Z",
      errorCode: null,
      errorMessage: null,
      createdAt: "2026-02-28T17:00:00.000Z",
      updatedAt: "2026-02-28T17:01:00.000Z"
    });

    expect(snapshot.totals.totalSales).toBe("300.00");
    expect(job.status).toBe("COMPLETED");
  });
});
