import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat
} from "node:fs/promises";
import { join } from "node:path";

import { Injectable } from "@nestjs/common";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

import type {
  ExportFormat,
  ExportReportType
} from "@warehouse/contracts";

import {
  buildExportLayout,
  type ExportCell,
  type ExportLayout
} from "./export-layout";

interface GenerateArtifactInput {
  exportJobId: string;
  reportType: ExportReportType;
  format: ExportFormat;
  snapshot: unknown;
  outputDirectory: string;
  thaiFontPath: string;
}

export interface GeneratedArtifact {
  artifactPath: string;
  fileName: string;
  contentType: string;
  fileChecksum: string;
  fileSizeBytes: number;
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  XLSX:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PDF: "application/pdf"
};

const REPORT_FILE_NAMES: Record<ExportReportType, string> = {
  SALES: "sales",
  GROSS_PROFIT: "gross-profit",
  INVENTORY_CURRENT: "inventory-current",
  INVENTORY_LOW_STOCK: "inventory-low-stock",
  INVENTORY_EXPIRY: "inventory-expiry",
  TOP_CUSTOMERS: "top-customers",
  NEW_CUSTOMERS: "new-customers"
};

@Injectable()
export class ExportArtifactGenerator {
  async generate(
    input: GenerateArtifactInput
  ): Promise<GeneratedArtifact> {
    await mkdir(input.outputDirectory, { recursive: true });
    const extension = input.format.toLowerCase();
    const fileName = `${REPORT_FILE_NAMES[input.reportType]}-${
      input.exportJobId
    }.${extension}`;
    const artifactPath = join(input.outputDirectory, fileName);
    const temporaryPath = `${artifactPath}.${randomUUID()}.tmp`;
    const layout = buildExportLayout(input.reportType, input.snapshot);

    try {
      if (input.format === "XLSX") {
        await this.writeXlsx(temporaryPath, layout);
      } else {
        await this.writePdf(temporaryPath, layout, input.thaiFontPath);
      }
      await rm(artifactPath, { force: true });
      await rename(temporaryPath, artifactPath);
      const [file, fileStat] = await Promise.all([
        readFile(artifactPath),
        stat(artifactPath)
      ]);
      return {
        artifactPath,
        fileName,
        contentType: CONTENT_TYPES[input.format],
        fileChecksum: createHash("sha256").update(file).digest("hex"),
        fileSizeBytes: fileStat.size
      };
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private async writeXlsx(
    path: string,
    layout: ExportLayout
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "U.O.K. Warehouse System";
    const worksheet = workbook.addWorksheet("รายงาน", {
      views: [{ state: "frozen", ySplit: 3 }]
    });
    worksheet.columns = layout.columnWidths.map((width) => ({ width }));
    worksheet.mergeCells(1, 1, 1, layout.headers.length);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = layout.title;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    const headerRow = worksheet.addRow([]);
    headerRow.hidden = true;
    const tableHeader = worksheet.addRow(layout.headers);
    tableHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
    tableHeader.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" }
    };
    tableHeader.alignment = {
      horizontal: "center",
      vertical: "middle"
    };

    for (const row of layout.rows) {
      worksheet.addRow(row);
    }
    for (const row of layout.totalRows) {
      const totalRow = worksheet.addRow(row);
      totalRow.font = { bold: true };
      totalRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9EAF7" }
      };
    }
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD0D0D0" } },
          left: { style: "thin", color: { argb: "FFD0D0D0" } },
          bottom: { style: "thin", color: { argb: "FFD0D0D0" } },
          right: { style: "thin", color: { argb: "FFD0D0D0" } }
        };
      });
    });
    await workbook.xlsx.writeFile(path);
  }

  private async writePdf(
    path: string,
    layout: ExportLayout,
    thaiFontPath: string
  ): Promise<void> {
    const document = new PDFDocument({
      size: "A4",
      margin: 36,
      compress: false,
      info: {
        Title: layout.title,
        Author: "U.O.K. Warehouse System"
      }
    });
    document.registerFont("Thai", thaiFontPath);
    document.font("Thai");
    const stream = createWriteStream(path);
    document.pipe(stream);

    document.fontSize(16).text(layout.title, { align: "center" });
    document.moveDown(0.8);
    this.drawPdfHeader(document, layout);
    for (const row of layout.rows) {
      this.ensurePdfSpace(document, layout);
      this.drawPdfRow(document, layout, row);
    }
    for (const row of layout.totalRows) {
      this.ensurePdfSpace(document, layout);
      this.drawPdfRow(document, layout, row, true);
    }
    document.end();

    await new Promise<void>((resolvePromise, rejectPromise) => {
      stream.once("finish", resolvePromise);
      stream.once("error", rejectPromise);
    });
  }

  private ensurePdfSpace(
    document: PDFKit.PDFDocument,
    layout: ExportLayout
  ): void {
    if (document.y <= document.page.height - 70) {
      return;
    }
    document.addPage();
    this.drawPdfHeader(document, layout);
  }

  private drawPdfHeader(
    document: PDFKit.PDFDocument,
    layout: ExportLayout
  ): void {
    this.drawPdfRow(document, layout, layout.headers, true);
  }

  private drawPdfRow(
    document: PDFKit.PDFDocument,
    layout: ExportLayout,
    row: ExportCell[],
    bold = false
  ): void {
    const availableWidth =
      document.page.width -
      document.page.margins.left -
      document.page.margins.right;
    const totalWeight = layout.columnWidths.reduce(
      (total, width) => total + width,
      0
    );
    const rowHeight = 24;
    const y = document.y;
    let x = document.page.margins.left;
    document.fontSize(8);
    for (let index = 0; index < layout.headers.length; index += 1) {
      const width =
        (availableWidth * (layout.columnWidths[index] ?? 1)) /
        totalWeight;
      document.rect(x, y, width, rowHeight).strokeColor("#cccccc").stroke();
      document.text(String(row[index] ?? ""), x + 3, y + 6, {
        width: width - 6,
        height: rowHeight - 8,
        ellipsis: true,
        align: typeof row[index] === "number" ? "right" : "left",
        continued: false
      });
      x += width;
    }
    if (bold) {
      document
        .rect(
          document.page.margins.left,
          y,
          availableWidth,
          rowHeight
        )
        .fillOpacity(0.06)
        .fill("#1f4e78")
        .fillOpacity(1);
    }
    document.y = y + rowHeight;
  }
}
