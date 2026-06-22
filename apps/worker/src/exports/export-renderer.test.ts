import { resolve } from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { ExportSnapshot } from "@warehouse/contracts";

import { renderExportPdf, renderExportWorkbook } from "./export-renderer";

const snapshot: ExportSnapshot = {
  reportType: "SALES",
  title: "รายงานยอดขาย",
  generatedAt: "2026-02-28T17:00:00.000Z",
  filters: {
    dateFrom: "2026-02-01",
    dateTo: "2026-02-28",
    groupBy: "month"
  },
  columns: [
    { key: "period", label: "ช่วงเวลา", width: 18 },
    { key: "invoiceCount", label: "จำนวนบิล", width: 14 },
    { key: "totalSales", label: "ยอดขาย", width: 18 }
  ],
  rows: [{ period: "2026-02", invoiceCount: 2, totalSales: "300.00" }],
  totals: {
    invoiceCount: 2,
    totalSales: "300.00"
  }
};

describe("export renderer", () => {
  it("writes report rows and totals to an Excel workbook", async () => {
    const buffer = await renderExportWorkbook(snapshot);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    const sheet = workbook.worksheets[0];

    expect(sheet?.getRow(4).values).toEqual([
      undefined,
      "ช่วงเวลา",
      "จำนวนบิล",
      "ยอดขาย"
    ]);
    expect(sheet?.getRow(5).values).toEqual([
      undefined,
      "2026-02",
      2,
      "300.00"
    ]);
    expect(sheet?.getRow(7).values).toEqual([undefined, "รวม", 2, "300.00"]);
  });

  it("embeds a Thai-capable font in a PDF artifact", async () => {
    const buffer = await renderExportPdf(snapshot, {
      fontPath: resolve("assets/fonts/NotoSansThai.ttf")
    });

    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(buffer.byteLength).toBeGreaterThan(5_000);
  });
});
