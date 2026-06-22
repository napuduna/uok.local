"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  LoaderCircle,
  Plus,
  Search,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import {
  paginatedSaleCatalogResponseSchema,
  paginatedSalesResponseSchema,
  saleResponseSchema,
  type CustomerResponse,
  type PaginatedSaleCatalogResponse,
  type PaginatedSalesResponse,
  type SaleCatalogItem,
  type SaleResponse
} from "@warehouse/contracts";

import { createIdempotencyKey } from "../lib/idempotency";

interface SalesWorkspaceProps {
  initialSales: PaginatedSalesResponse;
  initialCustomers: CustomerResponse[];
  initialCatalog: PaginatedSaleCatalogResponse;
  canCreate: boolean;
}

interface SaleDraftItem {
  catalog: SaleCatalogItem;
  quantity: string;
  unitPrice: string;
}

function decimalToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match) return 0;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function calculateSaleTotal(
  items: Pick<SaleDraftItem, "quantity" | "unitPrice">[]
): string {
  const cents = items.reduce(
    (total, item) =>
      total +
      Math.max(0, Number(item.quantity) || 0) *
        decimalToCents(item.unitPrice),
    0
  );
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function formatThb(value: string): string {
  return Number(value).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB"
  });
}

function formatThaiDate(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

export function SalesWorkspace({
  initialSales,
  initialCustomers,
  initialCatalog,
  canCreate
}: SalesWorkspaceProps) {
  const [mode, setMode] = useState<"list" | "create" | "review" | "receipt">(
    "list"
  );
  const [sales, setSales] = useState(initialSales);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [customerId, setCustomerId] = useState(initialCustomers[0]?.id ?? "");
  const [items, setItems] = useState<SaleDraftItem[]>([]);
  const [receipt, setReceipt] = useState<SaleResponse | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");

  const total = calculateSaleTotal(items);
  const selectedCustomer = initialCustomers.find(
    (customer) => customer.id === customerId
  );

  function startCreate() {
    setError("");
    setReceipt(null);
    setItems([]);
    setCustomerId(initialCustomers[0]?.id ?? "");
    setIdempotencyKey("");
    setMode("create");
  }

  function addProduct(item: SaleCatalogItem) {
    if (
      items.some(
        (candidate) => candidate.catalog.product.id === item.product.id
      )
    ) {
      setError(`สินค้า ${item.product.code} อยู่ในรายการแล้ว`);
      return;
    }
    setError("");
    setItems((current) => [
      ...current,
      {
        catalog: item,
        quantity: "1",
        unitPrice: item.salePrice
      }
    ]);
  }

  function updateItem(index: number, patch: Partial<SaleDraftItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  async function searchCatalog() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "25" });
      if (catalogSearch.trim()) params.set("search", catalogSearch.trim());
      const response = await fetch(`/api/v1/sales/catalog?${params}`);
      if (!response.ok) throw new Error("ไม่สามารถค้นหาสินค้าได้");
      setCatalog(
        paginatedSaleCatalogResponseSchema.parse(await response.json())
      );
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "ไม่สามารถค้นหาสินค้าได้"
      );
    } finally {
      setLoading(false);
    }
  }

  function openReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const invalid = items.find(
      (item) =>
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) < 1 ||
        Number(item.quantity) > item.catalog.totalAvailable ||
        decimalToCents(item.unitPrice) < 1
    );
    if (!customerId || items.length === 0 || invalid) {
      setError(
        invalid
          ? `ตรวจสอบจำนวนและราคาของสินค้า ${invalid.catalog.product.code}`
          : "เลือกลูกค้าและเพิ่มสินค้าอย่างน้อยหนึ่งรายการ"
      );
      return;
    }
    if (!idempotencyKey) setIdempotencyKey(createIdempotencyKey("sale"));
    setMode("review");
  }

  async function confirmSale() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/sales", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          customerId,
          items: items.map((item) => ({
            productId: item.catalog.product.id,
            quantity: Number(item.quantity),
            unitPrice: item.unitPrice
          }))
        })
      });
      if (!response.ok) {
        const body = (await response.json()) as {
          message?: string;
          details?: { productId?: string };
        };
        const affectedProduct = items.find(
          (item) => item.catalog.product.id === body.details?.productId
        );
        throw new Error(
          `${body.message ?? "ไม่สามารถบันทึกการขายได้"}${
            affectedProduct ? ` (${affectedProduct.catalog.product.code})` : ""
          }`
        );
      }
      const created = saleResponseSchema.parse(await response.json());
      setReceipt(created);
      setMode("receipt");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "ไม่สามารถบันทึกการขายได้"
      );
    } finally {
      setSaving(false);
    }
  }

  async function loadSales(page = 1) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(sales.pageSize),
        status
      });
      if (invoiceNumber.trim()) params.set("invoiceNumber", invoiceNumber.trim());
      if (filterCustomerId) params.set("customerId", filterCustomerId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const response = await fetch(`/api/v1/sales?${params}`);
      if (!response.ok) throw new Error("ไม่สามารถโหลดรายการขายได้");
      setSales(paginatedSalesResponseSchema.parse(await response.json()));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ไม่สามารถโหลดรายการขายได้"
      );
    } finally {
      setLoading(false);
    }
  }

  if (mode === "receipt" && receipt) {
    return (
      <section className="sales-workspace">
        <div className="stock-in-success">
          <CheckCircle2 size={38} />
          <div>
            <span>บันทึกการขายเรียบร้อย</span>
            <h2>{receipt.invoiceNumber}</h2>
            <p>
              {receipt.customer.code} · {formatThb(receipt.totalSales)}
            </p>
          </div>
        </div>
        <div className="sales-receipt-actions">
          <Link className="secondary-button" href={`/sales/${receipt.id}`}>
            <Eye size={16} />
            ดูรายละเอียดบิล
          </Link>
          <button className="primary-button" type="button" onClick={startCreate}>
            <Plus size={16} />
            สร้างบิลใหม่
          </button>
        </div>
      </section>
    );
  }

  if (mode === "review") {
    return (
      <section className="sales-workspace">
        <div className="workspace-heading">
          <div>
            <h2>ตรวจสอบก่อนบันทึกการขาย</h2>
            <p>
              {selectedCustomer?.code} · {selectedCustomer?.firstName}{" "}
              {selectedCustomer?.lastName}
            </p>
          </div>
          <strong className="sales-review-total">{formatThb(total)}</strong>
        </div>
        {error ? <p className="workspace-error">{error}</p> : null}
        <div className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th className="table-number">จำนวน</th>
                  <th className="table-number">ราคาต่อหน่วย</th>
                  <th className="table-number">ยอดรวม</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.catalog.product.id}>
                    <td>
                      <strong>{item.catalog.product.code}</strong>{" "}
                      {item.catalog.product.name}
                    </td>
                    <td className="table-number">{item.quantity}</td>
                    <td className="table-number">{formatThb(item.unitPrice)}</td>
                    <td className="table-number">
                      {formatThb(
                        calculateSaleTotal([
                          {
                            quantity: item.quantity,
                            unitPrice: item.unitPrice
                          }
                        ])
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stock-in-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={saving}
            onClick={() => setMode("create")}
          >
            <ArrowLeft size={16} />
            กลับไปแก้ไข
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={saving}
            onClick={() => void confirmSale()}
          >
            {saving ? (
              <LoaderCircle className="login-spinner" size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            ยืนยันบันทึกการขาย
          </button>
        </div>
      </section>
    );
  }

  if (mode === "create") {
    return (
      <section className="sales-workspace">
        <div className="workspace-heading">
          <div>
            <h2>สร้างบิลขาย</h2>
            <p>เลือกสินค้า ตรวจสอบสต๊อก และยืนยันยอดก่อนบันทึก</p>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setMode("list")}
          >
            <ArrowLeft size={16} />
            กลับรายการขาย
          </button>
        </div>
        {error ? <p className="workspace-error">{error}</p> : null}
        <form className="sale-form" onSubmit={openReview}>
          <label className="sale-customer-field">
            ลูกค้า
            <select
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              {initialCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.code} · {customer.firstName} {customer.lastName}
                </option>
              ))}
            </select>
          </label>

          <section className="panel sale-catalog-panel">
            <div className="panel-heading">
              <div>
                <h3>ค้นหาสินค้า</h3>
                <p>ยอดคงเหลือแสดงเฉพาะ LOT ที่ยังขายได้</p>
              </div>
              <div className="sale-catalog-search">
                <input
                  type="search"
                  aria-label="ค้นหาสินค้าสำหรับขาย"
                  placeholder="รหัสหรือชื่อสินค้า"
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                />
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void searchCatalog()}
                >
                  <Search size={16} />
                  ค้นหา
                </button>
              </div>
            </div>
            <div className="sale-catalog-results">
              {catalog.items.map((item) => (
                <button
                  className="sale-catalog-row"
                  type="button"
                  key={item.product.id}
                  disabled={item.totalAvailable === 0}
                  onClick={() => addProduct(item)}
                >
                  <span>
                    <strong>{item.product.code}</strong>
                    <small>{item.product.name}</small>
                  </span>
                  <span>
                    <strong>{formatThb(item.salePrice)}</strong>
                    <small>
                      คงเหลือ {item.totalAvailable.toLocaleString("th-TH")}{" "}
                      {item.unit.name}
                    </small>
                  </span>
                  <Plus size={17} />
                </button>
              ))}
              {catalog.items.length === 0 ? (
                <p className="workspace-state">ไม่พบสินค้าที่ค้นหา</p>
              ) : null}
            </div>
          </section>

          <section className="panel sale-items-panel">
            <div className="panel-heading">
              <div>
                <h3>รายการขาย</h3>
                <p>{items.length.toLocaleString("th-TH")} รายการ</p>
              </div>
              <strong className="sale-running-total">{formatThb(total)}</strong>
            </div>
            {items.length === 0 ? (
              <p className="workspace-state">ค้นหาและเพิ่มสินค้าจากด้านบน</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>สินค้า</th>
                      <th>คงเหลือ</th>
                      <th className="table-number">จำนวน</th>
                      <th className="table-number">ราคาต่อหน่วย</th>
                      <th className="table-number">ยอดรวม</th>
                      <th aria-label="การทำงาน" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.catalog.product.id}>
                        <td>
                          <strong>{item.catalog.product.code}</strong>{" "}
                          {item.catalog.product.name}
                        </td>
                        <td>
                          {item.catalog.totalAvailable.toLocaleString("th-TH")}{" "}
                          {item.catalog.unit.name}
                        </td>
                        <td className="table-number">
                          <input
                            className="table-input"
                            type="number"
                            min={1}
                            max={item.catalog.totalAvailable}
                            step={1}
                            aria-label={`จำนวน ${item.catalog.product.code}`}
                            value={item.quantity}
                            onChange={(event) =>
                              updateItem(index, {
                                quantity: event.target.value
                              })
                            }
                          />
                        </td>
                        <td className="table-number">
                          <input
                            className="table-input table-input--money"
                            inputMode="decimal"
                            pattern="\d+(?:\.\d{1,2})?"
                            aria-label={`ราคาต่อหน่วย ${item.catalog.product.code}`}
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateItem(index, {
                                unitPrice: event.target.value
                              })
                            }
                          />
                        </td>
                        <td className="table-number">
                          {formatThb(
                            calculateSaleTotal([
                              {
                                quantity: item.quantity,
                                unitPrice: item.unitPrice
                              }
                            ])
                          )}
                        </td>
                        <td>
                          <button
                            className="icon-button icon-button--danger"
                            type="button"
                            title="ลบรายการ"
                            aria-label={`ลบ ${item.catalog.product.code}`}
                            onClick={() =>
                              setItems((current) =>
                                current.filter(
                                  (_, itemIndex) => itemIndex !== index
                                )
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <div className="stock-in-actions">
            <button
              className="primary-button"
              type="submit"
              disabled={loading || items.length === 0}
            >
              ตรวจสอบรายการ · {formatThb(total)}
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="sales-workspace">
      <div className="workspace-heading">
        <div>
          <h2>รายการขาย</h2>
          <p>ค้นหาบิล ตรวจสอบยอดขาย และเปิดรายละเอียดการตัด LOT</p>
        </div>
        {canCreate ? (
          <button className="primary-button" type="button" onClick={startCreate}>
            <Plus size={16} />
            สร้างบิลขาย
          </button>
        ) : null}
      </div>
      {error ? <p className="workspace-error">{error}</p> : null}
      <form
        className="panel sale-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void loadSales(1);
        }}
      >
        <label>
          เลขที่บิล
          <input
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
          />
        </label>
        <label>
          ลูกค้า
          <select
            value={filterCustomerId}
            onChange={(event) => setFilterCustomerId(event.target.value)}
          >
            <option value="">ทั้งหมด</option>
            {initialCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code} · {customer.firstName} {customer.lastName}
              </option>
            ))}
          </select>
        </label>
        <label>
          ตั้งแต่วันที่
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label>
          ถึงวันที่
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
        <label>
          สถานะ
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            <option value="completed">สำเร็จ</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
        </label>
        <button className="secondary-button" type="submit" disabled={loading}>
          {loading ? (
            <LoaderCircle className="login-spinner" size={16} />
          ) : (
            <Search size={16} />
          )}
          ค้นหา
        </button>
      </form>

      <section className="panel sales-list-panel">
        {sales.items.length === 0 ? (
          <div className="workspace-state">ยังไม่มีรายการขาย</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>เลขที่บิล</th>
                  <th>วันที่ขาย</th>
                  <th>ลูกค้า</th>
                  <th>ผู้ขาย</th>
                  <th className="table-number">ยอดขาย</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {sales.items.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <Link className="table-link" href={`/sales/${sale.id}`}>
                        {sale.invoiceNumber}
                      </Link>
                    </td>
                    <td>{formatThaiDate(sale.soldAt)}</td>
                    <td>
                      {sale.customer.code} · {sale.customer.firstName}{" "}
                      {sale.customer.lastName}
                    </td>
                    <td>{sale.createdBy.name}</td>
                    <td className="table-number">{formatThb(sale.totalSales)}</td>
                    <td>
                      {sale.status === "COMPLETED" ? "สำเร็จ" : "ยกเลิก"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination-bar">
          <span>
            หน้า {sales.page.toLocaleString("th-TH")} ·{" "}
            {sales.total.toLocaleString("th-TH")} บิล
          </span>
          <div>
            <button
              className="secondary-button secondary-button--compact"
              type="button"
              disabled={sales.page <= 1 || loading}
              onClick={() => void loadSales(sales.page - 1)}
            >
              ก่อนหน้า
            </button>
            <button
              className="secondary-button secondary-button--compact"
              type="button"
              disabled={
                sales.page * sales.pageSize >= sales.total || loading
              }
              onClick={() => void loadSales(sales.page + 1)}
            >
              ถัดไป
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
