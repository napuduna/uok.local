import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  PackageOpen
} from "lucide-react";
import Link from "next/link";

import type {
  PaginatedLotsResponse,
  ProductResponse,
  ReconciliationResponse,
  StockSummaryResponse
} from "@warehouse/contracts";

interface InventoryWorkspaceProps {
  product: ProductResponse;
  stock: StockSummaryResponse;
  lots: PaginatedLotsResponse;
  reconciliation: ReconciliationResponse;
}

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "Asia/Bangkok"
});

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "ไม่กำหนด";
}

function formatThb(value: string): string {
  return `฿${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function InventoryWorkspace({
  product,
  stock,
  lots,
  reconciliation
}: InventoryWorkspaceProps) {
  return (
    <section className="inventory-workspace">
      <div className="workspace-heading inventory-heading">
        <div>
          <Link className="back-link" href="/products">
            <ArrowLeft size={16} />
            กลับไปรายการสินค้า
          </Link>
          <h2>
            {product.code} · {product.name}
          </h2>
          <p>
            {product.category.name} · {product.unit.name} ·{" "}
            {stock.warehouse.name}
          </p>
        </div>
        <div
          className={
            reconciliation.isBalanced
              ? "reconciliation-status reconciliation-status--ok"
              : "reconciliation-status reconciliation-status--error"
          }
        >
          {reconciliation.isBalanced ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}
          {reconciliation.isBalanced
            ? "Ledger ตรงกับยอดคงเหลือ"
            : "พบยอดคงเหลือไม่ตรง Ledger"}
        </div>
      </div>

      <div className="inventory-summary-grid">
        <div className="inventory-stat">
          <span>คงเหลือทั้งหมด</span>
          <strong>{stock.totalAvailable.toLocaleString("en-US")}</strong>
          <small>{product.unit.name}</small>
        </div>
        <div className="inventory-stat">
          <span>LOT ที่ใช้งาน</span>
          <strong>{stock.activeLotCount.toLocaleString("en-US")}</strong>
          <small>รายการ</small>
        </div>
        <div className="inventory-stat">
          <span>ราคาขาย</span>
          <strong>{formatThb(product.salePrice)}</strong>
          <small>ต่อ {product.unit.name}</small>
        </div>
        <div className="inventory-stat">
          <span>จุดแจ้งเตือน</span>
          <strong>{product.lowStockThreshold.toLocaleString("en-US")}</strong>
          <small>{product.unit.name}</small>
        </div>
      </div>

      <div className="panel lot-table-panel">
        <div className="panel-heading">
          <div>
            <h3>รายการ LOT</h3>
            <p>เรียงตามวันที่รับเข้าเพื่อรองรับ FIFO</p>
          </div>
          <span>{lots.total.toLocaleString("en-US")} LOT</span>
        </div>

        {lots.items.length === 0 ? (
          <div className="workspace-state">
            <PackageOpen size={24} />
            ยังไม่มี LOT สำหรับสินค้านี้
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>LOT</th>
                  <th>วันที่รับเข้า</th>
                  <th>วันหมดอายุ</th>
                  <th className="table-number">รับเข้า</th>
                  <th className="table-number">ขาย</th>
                  <th className="table-number">ปรับ</th>
                  <th className="table-number">คงเหลือ</th>
                  <th className="table-number">ต้นทุน/หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {lots.items.map((lot) => (
                  <tr key={lot.id}>
                    <td className="product-code">{lot.lotNumber}</td>
                    <td>{formatDate(lot.receivedAt)}</td>
                    <td>{formatDate(lot.expiryDate)}</td>
                    <td className="table-number">{lot.received}</td>
                    <td className="table-number">{lot.sold}</td>
                    <td className="table-number">{lot.adjusted}</td>
                    <td className="table-number">
                      <strong>{lot.availableQuantity}</strong>
                    </td>
                    <td className="table-number table-money">
                      {formatThb(lot.unitCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
