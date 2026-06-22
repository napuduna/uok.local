import { readFile } from "node:fs/promises";

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

import type { ExportSnapshot } from "@warehouse/contracts";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";

export const exportMimeTypes = {
  XLSX: XLSX_MIME,
  PDF: PDF_MIME
} as const;

export async function renderExportWorkbook(
  snapshot: ExportSnapshot
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "U.OK Warehouse System";
  workbook.created = new Date(snapshot.generatedAt);
  const worksheet = workbook.addWorksheet(safeSheetName(snapshot.title), {
    views: [{ state: "frozen", ySplit: 4 }]
  });
  worksheet.columns = snapshot.columns.map((column) => ({
    key: column.key,
    width: column.width
  }));

  worksheet.mergeCells(1, 1, 1, snapshot.columns.length);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = snapshot.title;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 24;

  worksheet.mergeCells(2, 1, 2, snapshot.columns.length);
  worksheet.getCell(2, 1).value = `สร้างเมื่อ ${formatBangkokDateTime(
    snapshot.generatedAt
  )}`;
  worksheet.getCell(2, 1).font = { color: { argb: "FF666666" }, size: 10 };

  worksheet.mergeCells(3, 1, 3, snapshot.columns.length);
  worksheet.getCell(3, 1).value = formatFilters(snapshot.filters);
  worksheet.getCell(3, 1).font = { color: { argb: "FF666666" }, size: 10 };

  const header = worksheet.getRow(4);
  header.values = snapshot.columns.map((column) => column.label);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4D3A" }
  };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 22;

  for (const row of snapshot.rows) {
    const worksheetRow = worksheet.addRow(
      snapshot.columns.map((column) => row[column.key] ?? "")
    );
    worksheetRow.alignment = { vertical: "top" };
    worksheetRow.eachCell((cell) => {
      cell.border = thinBorder();
    });
  }

  worksheet.addRow([]);
  const totalsRow = worksheet.addRow(
    snapshot.columns.map((column, index) =>
      index === 0 ? "รวม" : (snapshot.totals[column.key] ?? "")
    )
  );
  totalsRow.font = { bold: true };
  totalsRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F1ED" }
  };
  totalsRow.eachCell((cell) => {
    cell.border = thinBorder();
  });

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}

export async function renderExportPdf(
  snapshot: ExportSnapshot,
  options: { fontPath: string }
): Promise<Buffer> {
  const font = await readFile(options.fontPath);
  const document = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 36,
    bufferPages: true,
    info: {
      Title: snapshot.title,
      Author: "U.OK Warehouse System"
    }
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.registerFont("NotoSansThai", font);
  document.font("NotoSansThai");
  document.fontSize(18).text(snapshot.title);
  document
    .fontSize(9)
    .fillColor("#555555")
    .text(`สร้างเมื่อ ${formatBangkokDateTime(snapshot.generatedAt)}`)
    .text(formatFilters(snapshot.filters));
  document.moveDown(0.6);

  const availableWidth =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  const totalConfiguredWidth = snapshot.columns.reduce(
    (total, column) => total + column.width,
    0
  );
  const columnWidths = snapshot.columns.map(
    (column) => (column.width / totalConfiguredWidth) * availableWidth
  );

  drawPdfHeader(document, snapshot, columnWidths);
  for (const row of snapshot.rows) {
    ensurePdfSpace(document, snapshot, columnWidths, 24);
    drawPdfRow(
      document,
      snapshot.columns.map((column) => String(row[column.key] ?? "")),
      columnWidths,
      false
    );
  }

  ensurePdfSpace(document, snapshot, columnWidths, 28);
  document.moveDown(0.3);
  drawPdfRow(
    document,
    snapshot.columns.map((column, index) =>
      index === 0 ? "รวม" : String(snapshot.totals[column.key] ?? "")
    ),
    columnWidths,
    true
  );

  document.end();
  return completed;
}

function drawPdfHeader(
  document: PDFKit.PDFDocument,
  snapshot: ExportSnapshot,
  columnWidths: number[]
): void {
  drawPdfRow(
    document,
    snapshot.columns.map((column) => column.label),
    columnWidths,
    true
  );
}

function drawPdfRow(
  document: PDFKit.PDFDocument,
  values: string[],
  columnWidths: number[],
  emphasized: boolean
): void {
  const startX = document.page.margins.left;
  const startY = document.y;
  const padding = 4;
  const heights = values.map((value, index) =>
    document.heightOfString(value, {
      width: columnWidths[index]! - padding * 2,
      align: index === 0 ? "left" : "right"
    })
  );
  const height = Math.max(22, ...heights.map((value) => value + padding * 2));
  let x = startX;

  for (const [index, value] of values.entries()) {
    const width = columnWidths[index]!;
    document
      .rect(x, startY, width, height)
      .fillAndStroke(emphasized ? "#E8F1ED" : "#FFFFFF", "#B8C6BF");
    document
      .fillColor("#15251E")
      .fontSize(8)
      .text(value, x + padding, startY + padding, {
        width: width - padding * 2,
        height: height - padding * 2,
        align: index === 0 ? "left" : "right"
      });
    x += width;
  }
  document.y = startY + height;
}

function ensurePdfSpace(
  document: PDFKit.PDFDocument,
  snapshot: ExportSnapshot,
  columnWidths: number[],
  requiredHeight: number
): void {
  const bottom = document.page.height - document.page.margins.bottom;
  if (document.y + requiredHeight <= bottom) return;
  document.addPage({ size: "A4", layout: "landscape", margin: 36 });
  drawPdfHeader(document, snapshot, columnWidths);
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const line = { style: "thin", color: { argb: "FFB8C6BF" } } as const;
  return { top: line, left: line, bottom: line, right: line };
}

function safeSheetName(value: string): string {
  return value.replaceAll(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Report";
}

function formatFilters(filters: Record<string, unknown>): string {
  const entries = Object.entries(filters);
  if (entries.length === 0) return "ตัวกรอง: ทั้งหมด";
  return `ตัวกรอง: ${entries
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ")}`;
}

function formatBangkokDateTime(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
