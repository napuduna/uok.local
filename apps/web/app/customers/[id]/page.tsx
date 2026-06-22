import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { customerPurchaseHistoryResponseSchema } from "@warehouse/contracts";

import { DashboardShell } from "../../../components/dashboard-shell";
import { getCurrentUser } from "../../../lib/server-auth";

const genderLabels = {
  MALE: "ชาย",
  FEMALE: "หญิง",
  OTHER: "อื่น ๆ",
  UNSPECIFIED: "ไม่ระบุ"
} as const;

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

function formatThb(value: string): string {
  return Number(value).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB"
  });
}

export default async function CustomerDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const cookieStore = await cookies();
  const apiBaseUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(
    `${apiBaseUrl}/api/v1/customers/${id}/purchase-history?page=1&pageSize=25`,
    {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store"
    }
  );
  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(
      `Customer API request failed with status ${response.status}`
    );
  }
  const history = customerPurchaseHistoryResponseSchema.parse(
    await response.json()
  );
  const customer = history.customer;

  return (
    <DashboardShell
      currentUser={user}
      pageTitle="รายละเอียดลูกค้า"
      activePath="/customers"
    >
      <section className="customer-detail">
        <div className="workspace-heading">
          <div>
            <Link className="back-link" href="/customers">
              กลับไปรายการลูกค้า
            </Link>
            <h2>
              {customer.code} · {customer.firstName} {customer.lastName}
            </h2>
            <p>
              {customer.isActive ? "ลูกค้าที่ใช้งานอยู่" : "เก็บประวัติแล้ว"}
            </p>
          </div>
        </div>

        <section className="panel customer-profile-grid">
          <div>
            <span>โทรศัพท์</span>
            <strong>{customer.phone || "-"}</strong>
          </div>
          <div>
            <span>อายุ</span>
            <strong>{customer.age} ปี</strong>
          </div>
          <div>
            <span>เพศ</span>
            <strong>{genderLabels[customer.gender]}</strong>
          </div>
          <div>
            <span>วันที่เริ่มเป็นลูกค้า</span>
            <strong>{formatThaiDate(customer.joinedAt)}</strong>
          </div>
          <div className="customer-profile-grid__wide">
            <span>ที่อยู่</span>
            <strong>{customer.address || "-"}</strong>
          </div>
        </section>

        <section className="customer-summary-grid">
          <div className="panel">
            <span>จำนวนบิล</span>
            <strong>
              {history.summary.orderCount.toLocaleString("th-TH")}
            </strong>
          </div>
          <div className="panel">
            <span>ยอดซื้อรวม</span>
            <strong>{formatThb(history.summary.totalSales)}</strong>
          </div>
          <div className="panel">
            <span>กำไรขั้นต้น</span>
            <strong>{formatThb(history.summary.grossProfit)}</strong>
          </div>
        </section>

        <section className="panel customer-history-panel">
          <div className="panel__header">
            <div>
              <h3>ประวัติการซื้อ</h3>
              <p>รายการขายที่ผูกกับลูกค้ารายนี้</p>
            </div>
          </div>
          {history.items.length === 0 ? (
            <div className="workspace-state">ยังไม่มีประวัติการซื้อ</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>เลขที่บิล</th>
                    <th>วันที่ขาย</th>
                    <th className="table-number">รายการ</th>
                    <th className="table-number">ยอดขาย</th>
                    <th className="table-number">กำไรขั้นต้น</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.items.map((sale) => (
                    <tr key={sale.saleId}>
                      <td className="product-code">{sale.invoiceNumber}</td>
                      <td>{formatThaiDate(sale.soldAt)}</td>
                      <td className="table-number">{sale.itemCount}</td>
                      <td className="table-number">
                        {formatThb(sale.totalSales)}
                      </td>
                      <td className="table-number">
                        {formatThb(sale.grossProfit)}
                      </td>
                      <td>
                        {sale.status === "COMPLETED" ? "สำเร็จ" : "ยกเลิก"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </DashboardShell>
  );
}
