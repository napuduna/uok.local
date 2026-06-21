import type { ExportReportType } from "@warehouse/contracts";

export type ExportCell = string | number;

export interface ExportLayout {
  title: string;
  headers: string[];
  columnWidths: number[];
  rows: ExportCell[][];
  totalRows: ExportCell[][];
}

export function buildExportLayout(
  reportType: ExportReportType,
  snapshot: unknown
): ExportLayout {
  const report = asRecord(snapshot);
  const items = asRecordArray(report.items);
  const totals = asOptionalRecord(report.totals);

  switch (reportType) {
    case "SALES":
      return {
        title: "รายงานยอดขาย",
        headers: ["ช่วงเวลา", "จำนวนบิล", "จำนวนขาย", "ยอดขาย (บาท)"],
        columnWidths: [22, 14, 14, 20],
        rows: items.map((item) => [
          stringValue(item.period),
          numberValue(item.invoiceCount),
          numberValue(item.quantitySold),
          stringValue(item.totalSales)
        ]),
        totalRows: totals
          ? [
              [
                "รวม",
                numberValue(totals.invoiceCount),
                numberValue(totals.quantitySold),
                stringValue(totals.totalSales)
              ]
            ]
          : []
      };
    case "GROSS_PROFIT":
      return {
        title: "รายงานกำไรขั้นต้น",
        headers: [
          "ช่วงเวลา",
          "ยอดขาย (บาท)",
          "ต้นทุนขาย (บาท)",
          "กำไรขั้นต้น (บาท)"
        ],
        columnWidths: [20, 18, 18, 20],
        rows: items.map((item) => [
          stringValue(item.period),
          stringValue(item.totalSales),
          stringValue(item.totalCost),
          stringValue(item.grossProfit)
        ]),
        totalRows: totals
          ? [
              [
                "รวม",
                stringValue(totals.totalSales),
                stringValue(totals.totalCost),
                stringValue(totals.grossProfit)
              ]
            ]
          : []
      };
    case "INVENTORY_CURRENT":
      return inventoryLayout("รายงานสต๊อกปัจจุบัน", items, totals, false);
    case "INVENTORY_LOW_STOCK":
      return inventoryLayout("รายงานสินค้าใกล้หมด", items, totals, true);
    case "INVENTORY_EXPIRY":
      return {
        title: "รายงานวันหมดอายุ",
        headers: [
          "รหัสสินค้า",
          "สินค้า",
          "LOT",
          "วันหมดอายุ",
          "คงเหลือ",
          "ต้นทุน/หน่วย",
          "มูลค่า",
          "สถานะ"
        ],
        columnWidths: [14, 24, 16, 15, 12, 16, 16, 16],
        rows: items.map((item) => {
          const product = asRecord(item.product);
          const lot = asRecord(item.lot);
          return [
            stringValue(product.code),
            stringValue(product.name),
            stringValue(lot.lotNumber),
            stringValue(item.expiryDate).slice(0, 10),
            numberValue(item.availableQuantity),
            stringValue(item.unitCost),
            stringValue(item.inventoryValue),
            stringValue(item.status)
          ];
        }),
        totalRows: totals
          ? [
              [
                "รวม",
                "",
                "",
                "",
                numberValue(totals.quantity),
                "",
                stringValue(totals.inventoryValue),
                ""
              ]
            ]
          : []
      };
    case "TOP_CUSTOMERS":
      return {
        title: "รายงานลูกค้ายอดซื้อสูงสุด",
        headers: [
          "รหัสลูกค้า",
          "ชื่อลูกค้า",
          "จำนวนบิล",
          "จำนวนขาย",
          "ยอดขาย",
          "กำไรขั้นต้น"
        ],
        columnWidths: [15, 28, 13, 13, 17, 18],
        rows: items.map((item) => {
          const customer = asRecord(item.customer);
          return [
            stringValue(customer.code),
            `${stringValue(customer.firstName)} ${stringValue(
              customer.lastName
            )}`.trim(),
            numberValue(item.invoiceCount),
            numberValue(item.quantitySold),
            stringValue(item.totalSales),
            stringValue(item.grossProfit)
          ];
        }),
        totalRows: []
      };
    case "NEW_CUSTOMERS":
      return {
        title: "รายงานลูกค้าใหม่",
        headers: ["รหัสลูกค้า", "ชื่อลูกค้า", "วันที่เข้าร่วม"],
        columnWidths: [18, 34, 20],
        rows: items.map((item) => {
          const customer = asRecord(item.customer);
          return [
            stringValue(customer.code),
            `${stringValue(customer.firstName)} ${stringValue(
              customer.lastName
            )}`.trim(),
            stringValue(item.joinedAt).slice(0, 10)
          ];
        }),
        totalRows: []
      };
  }
}

function inventoryLayout(
  title: string,
  items: Record<string, unknown>[],
  totals: Record<string, unknown> | null,
  includeShortage: boolean
): ExportLayout {
  const headers = [
    "รหัสสินค้า",
    "สินค้า",
    "คงเหลือ",
    "จุดสั่งซื้อ",
    ...(includeShortage ? ["ขาดจากเกณฑ์"] : []),
    "มูลค่าสต๊อก"
  ];
  return {
    title,
    headers,
    columnWidths: includeShortage
      ? [15, 28, 13, 14, 16, 18]
      : [15, 30, 14, 15, 19],
    rows: items.map((item) => {
      const product = asRecord(item.product);
      return [
        stringValue(product.code),
        stringValue(product.name),
        numberValue(item.totalAvailable),
        numberValue(item.lowStockThreshold),
        ...(includeShortage ? [numberValue(item.shortage)] : []),
        stringValue(item.inventoryValue)
      ];
    }),
    totalRows: totals
      ? [
          [
            "รวม",
            "",
            numberValue(totals.quantity),
            "",
            ...(includeShortage ? [""] : []),
            stringValue(totals.inventoryValue)
          ]
        ]
      : []
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid export snapshot object");
  }
  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null {
  return value === undefined ? null : asRecord(value);
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid export snapshot items");
  }
  return value.map(asRecord);
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Invalid export snapshot string");
  }
  return value;
}

function numberValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Invalid export snapshot number");
  }
  return value;
}
