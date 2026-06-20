import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ExportArtifactGenerator } from "./export-artifact.generator";
import { buildExportLayout } from "./export-layout";

const exportId = "00000000-0000-4000-8000-000000000001";
const salesSnapshot = {
  items: [
    {
      period: "2026-02",
      invoiceCount: 2,
      quantitySold: 8,
      totalSales: "300.00"
    }
  ],
  page: 1,
  pageSize: 100,
  total: 1,
  totals: {
    invoiceCount: 2,
    quantitySold: 8,
    totalSales: "300.00"
  }
};

describe("ExportArtifactGenerator", () => {
  let outputDirectory: string;
  let generator: ExportArtifactGenerator;

  beforeEach(async () => {
    outputDirectory = await mkdtemp(resolve(tmpdir(), "uok-export-"));
    generator = new ExportArtifactGenerator();
  });

  afterEach(async () => {
    await rm(outputDirectory, { recursive: true, force: true });
  });

  it("builds one stable layout containing the report and total rows", () => {
    const layout = buildExportLayout("SALES", salesSnapshot);

    expect(layout.title).toBe("รายงานยอดขาย");
    expect(layout.rows).toEqual([
      ["2026-02", 2, 8, "300.00"]
    ]);
    expect(layout.totalRows).toEqual([
      ["รวม", 2, 8, "300.00"]
    ]);
  });

  it("writes an XLSX whose totals equal the report snapshot", async () => {
    const artifact = await generator.generate({
      exportJobId: exportId,
      reportType: "SALES",
      format: "XLSX",
      snapshot: salesSnapshot,
      outputDirectory,
      thaiFontPath: thaiFontPath()
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(artifact.artifactPath);
    const worksheet = workbook.worksheets[0]!;
    const values = worksheet
      .getSheetValues()
      .flatMap((row) => (Array.isArray(row) ? row : []));

    expect(artifact.fileName).toBe(`sales-${exportId}.xlsx`);
    expect(artifact.fileChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.fileSizeBytes).toBeGreaterThan(0);
    expect(values).toContain("300.00");
  });

  it("writes a Thai-capable PDF from the same layout totals", async () => {
    const artifact = await generator.generate({
      exportJobId: exportId,
      reportType: "SALES",
      format: "PDF",
      snapshot: salesSnapshot,
      outputDirectory,
      thaiFontPath: thaiFontPath()
    });
    const file = await readFile(artifact.artifactPath);

    expect(artifact.fileName).toBe(`sales-${exportId}.pdf`);
    expect(artifact.fileChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(file.subarray(0, 5).toString()).toBe("%PDF-");
    expect(file.length).toBeGreaterThan(1_000);
  });
});

function thaiFontPath(): string {
  return resolve(
    process.cwd(),
    "node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2"
  );
}
