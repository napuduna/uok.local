import {
  Archive,
  BarChart3,
  Boxes,
  CalendarClock,
  TrendingDown,
  TrendingUp,
  Users
} from "lucide-react";
import Link from "next/link";

import type {
  DashboardAlertsResponse,
  DashboardSummaryResponse
} from "@warehouse/contracts";
import { MetricCard, StatusDot } from "@warehouse/ui";

interface DashboardOverviewProps {
  summary: DashboardSummaryResponse;
  alerts: DashboardAlertsResponse | null;
}

function formatThb(value: string | null): string {
  if (value === null) return "-";
  return Number(value).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB"
  });
}

function formatNumber(value: number): string {
  return value.toLocaleString("th-TH");
}

export function DashboardOverview({ summary, alerts }: DashboardOverviewProps) {
  const maxDaily = Math.max(
    1,
    ...summary.dailySales.map((day) => Number(day.totalSales))
  );

  return (
    <>
      <section className="dashboard__heading">
        <div>
          <h2>สถานะธุรกิจวันนี้</h2>
          <p>ข้อมูลล่าสุดจากคลังหลักและรายการขายที่คุณมีสิทธิ์ดู</p>
        </div>
        <Link className="secondary-button" href="/reports">
          <BarChart3 size={17} />
          ดูรายงาน
        </Link>
      </section>

      <section className="metrics-grid" aria-label="สรุปข้อมูล">
        <MetricCard
          icon={<Boxes size={20} />}
          label="สินค้าทั้งหมด"
          value={`${formatNumber(summary.cards.productCount)} รายการ`}
          detail={`สต๊อก ${formatNumber(summary.cards.stockQuantity)} ชิ้น`}
        />
        <MetricCard
          icon={<Users size={20} />}
          label="ลูกค้า"
          value={`${formatNumber(summary.cards.customerCount)} ราย`}
          detail={`สต๊อกต่ำ ${formatNumber(summary.cards.lowStockCount)} รายการ`}
        />
        {summary.cards.todaySales !== null ? (
          <MetricCard
            icon={<TrendingUp size={20} />}
            label="ยอดขายวันนี้"
            value={formatThb(summary.cards.todaySales)}
            detail={`เดือนนี้ ${formatThb(summary.cards.monthSales)}`}
            tone="positive"
          />
        ) : null}
        {summary.cards.monthGrossProfit !== null ? (
          <MetricCard
            icon={<BarChart3 size={20} />}
            label="กำไรขั้นต้นเดือนนี้"
            value={formatThb(summary.cards.monthGrossProfit)}
            detail={`ต้นทุนขาย ${formatThb(summary.cards.monthSoldCost)}`}
            tone="positive"
          />
        ) : null}
        {summary.cards.inventoryValue !== null ? (
          <MetricCard
            icon={<Archive size={20} />}
            label="มูลค่าสินค้าคงเหลือ"
            value={formatThb(summary.cards.inventoryValue)}
            detail={summary.warehouse.name}
          />
        ) : null}
      </section>

      <section className="dashboard-grid">
        <article className="panel sales-panel">
          <div className="panel__header">
            <div>
              <h3>ยอดขายรายวัน</h3>
              <p>รวมจากบิลที่สำเร็จในเดือนปัจจุบัน</p>
            </div>
          </div>
          <div className="chart-summary">
            <strong>{formatThb(summary.cards.monthSales)}</strong>
            {summary.cards.monthGrossProfit !== null ? (
              <span>
                <TrendingUp size={14} />
                กำไรขั้นต้น {formatThb(summary.cards.monthGrossProfit)}
              </span>
            ) : null}
          </div>
          {summary.dailySales.length === 0 ? (
            <div className="workspace-state">ยังไม่มียอดขายในเดือนนี้</div>
          ) : (
            <div className="bar-chart" aria-label="กราฟยอดขายรายวัน">
              {summary.dailySales.map((day) => (
                <div className="bar-chart__item" key={day.date}>
                  <div
                    className="bar-chart__bar"
                    style={{
                      height: `${Math.max(
                        8,
                        (Number(day.totalSales) / maxDaily) * 100
                      )}%`
                    }}
                  />
                  <span>{Number(day.date.slice(-2))}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel alert-panel">
          <div className="panel__header">
            <div>
              <h3>การแจ้งเตือนคลัง</h3>
              <p>สต๊อกต่ำและ LOT ใกล้หมดอายุ</p>
            </div>
            <span className="alert-count">
              {formatNumber(
                (alerts?.lowStockCount ?? 0) +
                  (alerts?.expiredLotCount ?? 0) +
                  (alerts?.expiringSoonLotCount ?? 0)
              )}
            </span>
          </div>
          <div className="alert-list">
            {alerts?.lowStockItems.map((item) => (
              <div className="alert-row" key={`low-stock-${item.product.id}`}>
                <div className="product-avatar product-avatar--warning">
                  <TrendingDown size={17} />
                </div>
                <div className="alert-row__copy">
                  <strong>{item.product.name}</strong>
                  <span>{item.product.code} · สต๊อกต่ำ</span>
                </div>
                <div className="alert-row__stock">
                  <strong>{formatNumber(item.totalAvailable)}</strong>
                  <span>เกณฑ์ {formatNumber(item.lowStockThreshold)}</span>
                </div>
              </div>
            ))}
            {alerts?.expiryItems.map((item) => (
              <div className="alert-row" key={`expiry-${item.lot.id}`}>
                <div className="product-avatar product-avatar--warning">
                  <CalendarClock size={17} />
                </div>
                <div className="alert-row__copy">
                  <strong>{item.product.name}</strong>
                  <span>{item.lot.lotNumber}</span>
                </div>
                <div className="alert-row__stock">
                  <strong>{formatNumber(item.availableQuantity)}</strong>
                  <span>
                    {item.status === "EXPIRED"
                      ? "หมดอายุแล้ว"
                      : `อีก ${formatNumber(item.daysUntilExpiry)} วัน`}
                  </span>
                </div>
              </div>
            ))}
            {!alerts ||
            (alerts.lowStockItems.length === 0 &&
              alerts.expiryItems.length === 0) ? (
              <p className="alert-empty">ไม่มีรายการที่ต้องดำเนินการ</p>
            ) : null}
          </div>
          <Link className="panel-link" href="/products">
            ดูสินค้าทั้งหมด
          </Link>
        </article>
      </section>

      <section className="panel products-panel">
        <div className="panel__header panel__header--table">
          <div>
            <h3>สินค้าขายดี</h3>
            <p>เรียงตามจำนวนขายในเดือนปัจจุบัน</p>
          </div>
          <Link
            className="secondary-button secondary-button--compact"
            href="/sales"
          >
            ดูรายการขาย
          </Link>
        </div>
        {summary.topProducts.length === 0 ? (
          <div className="workspace-state">ยังไม่มีสินค้าขายในเดือนนี้</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>สินค้า</th>
                  <th className="table-number">ขายแล้ว</th>
                  <th className="table-number">ยอดขาย</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {summary.topProducts.map((product) => (
                  <tr key={product.product.id}>
                    <td className="product-code">{product.product.code}</td>
                    <td>
                      <strong>{product.product.name}</strong>
                    </td>
                    <td className="table-number">
                      {formatNumber(product.quantitySold)}
                    </td>
                    <td className="table-number table-money">
                      {formatThb(product.totalSales)}
                    </td>
                    <td>
                      <StatusDot label="สำเร็จ" tone="ok" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
