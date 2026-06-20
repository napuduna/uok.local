import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  hasPermission,
  Permission,
  saleResponseSchema
} from "@warehouse/contracts";

import { DashboardShell } from "../../../components/dashboard-shell";
import { SaleCancellationControl } from "../../../components/sale-cancellation-control";
import { getCurrentUser } from "../../../lib/server-auth";

function formatThb(value: string): string {
  return Number(value).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB"
  });
}

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

export default async function SaleDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(`${apiBaseUrl}/api/v1/sales/${id}`, {
    headers: { cookie: cookieStore.toString() },
    cache: "no-store"
  });
  if (response.status === 404) notFound();
  if (!response.ok) {
    throw new Error(`Sale API request failed with status ${response.status}`);
  }
  const sale = saleResponseSchema.parse(await response.json());

  return (
    <DashboardShell
      currentUser={user}
      pageTitle="รายละเอียดบิลขาย"
      activePath="/sales"
    >
      <section className="sale-detail">
        <div className="workspace-heading">
          <div>
            <Link className="back-link" href="/sales">
              กลับไปรายการขาย
            </Link>
            <h2>{sale.invoiceNumber}</h2>
            <p>
              {formatThaiDate(sale.soldAt)} · {sale.warehouse.name} ·{" "}
              {sale.status === "COMPLETED" ? "สำเร็จ" : "ยกเลิก"}
            </p>
          </div>
          <SaleCancellationControl
            saleId={sale.id}
            status={sale.status}
            canCancel={hasPermission(user.role, Permission.SALE_CANCEL)}
          />
        </div>

        {sale.status === "CANCELLED" ? (
          <section className="sale-cancelled-notice">
            <strong>บิลนี้ถูกยกเลิกแล้ว</strong>
            <span>{sale.cancellationReason}</span>
          </section>
        ) : null}

        <section className="panel sale-detail-party">
          <div>
            <span>ลูกค้า</span>
            <strong>
              {sale.customer.code} · {sale.customer.firstName}{" "}
              {sale.customer.lastName}
            </strong>
          </div>
          <div>
            <span>ผู้ขาย</span>
            <strong>{sale.createdBy.name}</strong>
          </div>
        </section>

        <section className="sale-detail-summary">
          <div className="panel">
            <span>ยอดขาย</span>
            <strong>{formatThb(sale.totalSales)}</strong>
          </div>
          <div className="panel">
            <span>ต้นทุนขาย</span>
            <strong>{formatThb(sale.totalCost)}</strong>
          </div>
          <div className="panel">
            <span>กำไรขั้นต้น</span>
            <strong>{formatThb(sale.grossProfit)}</strong>
          </div>
        </section>

        <section className="panel sale-detail-items">
          <div className="panel__header">
            <div>
              <h3>สินค้าและการตัด LOT</h3>
              <p>ต้นทุนอ้างอิง snapshot ณ เวลาบันทึกการขาย</p>
            </div>
          </div>
          {sale.items.map((item) => (
            <div className="sale-detail-item" key={item.id}>
              <div className="sale-detail-item__heading">
                <div>
                  <strong>
                    {item.product.code} · {item.product.name}
                  </strong>
                  <span>
                    {item.quantity.toLocaleString("th-TH")} ชิ้น ×{" "}
                    {formatThb(item.unitPrice)}
                  </span>
                </div>
                <div>
                  <span>ยอดขาย</span>
                  <strong>{formatThb(item.salesSubtotal)}</strong>
                </div>
                <div>
                  <span>กำไรขั้นต้น</span>
                  <strong>{formatThb(item.grossProfit)}</strong>
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>LOT</th>
                      <th className="table-number">จำนวน</th>
                      <th className="table-number">ต้นทุนต่อหน่วย</th>
                      <th className="table-number">ต้นทุนรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td className="product-code">
                          {allocation.lotNumber}
                        </td>
                        <td className="table-number">
                          {allocation.quantity.toLocaleString("th-TH")}
                        </td>
                        <td className="table-number">
                          {formatThb(allocation.unitCost)}
                        </td>
                        <td className="table-number">
                          {formatThb(allocation.costSubtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      </section>
    </DashboardShell>
  );
}
