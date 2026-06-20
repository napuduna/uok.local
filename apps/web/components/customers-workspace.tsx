"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  X
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import type {
  CustomerGender,
  CustomerResponse,
  PaginatedCustomersResponse
} from "@warehouse/contracts";

interface CustomersWorkspaceProps {
  initialCustomers: PaginatedCustomersResponse;
  canManage: boolean;
}

interface CustomerFormState {
  code: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: CustomerGender;
  address: string;
  phone: string;
  joinedAt: string;
}

const genderLabels: Record<CustomerGender, string> = {
  MALE: "ชาย",
  FEMALE: "หญิง",
  OTHER: "อื่น ๆ",
  UNSPECIFIED: "ไม่ระบุ"
};

function dateInputValue(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function emptyForm(): CustomerFormState {
  return {
    code: "",
    firstName: "",
    lastName: "",
    age: 0,
    gender: "UNSPECIFIED",
    address: "",
    phone: "",
    joinedAt: dateInputValue(new Date())
  };
}

function toApiDate(value: string): string {
  return new Date(`${value}T00:00:00+07:00`).toISOString();
}

export function CustomersWorkspace({
  initialCustomers,
  canManage
}: CustomersWorkspaceProps) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerResponse | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  async function loadCustomers(page = 1) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(customers.pageSize),
      status
    });
    if (search.trim()) params.set("search", search.trim());

    try {
      const response = await fetch(`/api/v1/customers?${params.toString()}`);
      if (!response.ok) throw new Error("ไม่สามารถโหลดรายการลูกค้าได้");
      setCustomers((await response.json()) as PaginatedCustomersResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ไม่สามารถโหลดรายการลูกค้าได้"
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setDrawerOpen(true);
  }

  function openEdit(customer: CustomerResponse) {
    setEditing(customer);
    setForm({
      code: customer.code,
      firstName: customer.firstName,
      lastName: customer.lastName,
      age: customer.age,
      gender: customer.gender,
      address: customer.address,
      phone: customer.phone,
      joinedAt: dateInputValue(new Date(customer.joinedAt))
    });
    setError("");
    setDrawerOpen(true);
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editing ? `/api/v1/customers/${editing.id}` : "/api/v1/customers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...form,
            joinedAt: toApiDate(form.joinedAt)
          })
        }
      );
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "ไม่สามารถบันทึกลูกค้าได้");
      }
      setDrawerOpen(false);
      await loadCustomers(editing ? customers.page : 1);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "ไม่สามารถบันทึกลูกค้าได้"
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveCustomer(customer: CustomerResponse) {
    if (
      !window.confirm(`ยืนยันการเก็บลูกค้า ${customer.code} เข้าคลังประวัติ`)
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/customers/${customer.id}/archive`, {
        method: "PATCH"
      });
      if (!response.ok) throw new Error("ไม่สามารถเก็บลูกค้าเข้าประวัติได้");
      await loadCustomers(customers.page);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "ไม่สามารถเก็บลูกค้าเข้าประวัติได้"
      );
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(
    1,
    Math.ceil(customers.total / customers.pageSize)
  );

  return (
    <section className="product-workspace">
      <div className="workspace-heading">
        <div>
          <h2>รายการลูกค้า</h2>
          <p>จัดการข้อมูลติดต่อและดูประวัติการซื้อของลูกค้า</p>
        </div>
        {canManage ? (
          <button className="primary-button" type="button" onClick={openCreate}>
            <Plus size={17} />
            เพิ่มลูกค้า
          </button>
        ) : null}
      </div>

      <div className="product-toolbar">
        <label className="workspace-search">
          <Search size={17} />
          <span className="sr-only">ค้นหาลูกค้า</span>
          <input
            aria-label="ค้นหาลูกค้า"
            type="search"
            value={search}
            placeholder="รหัส ชื่อ นามสกุล หรือโทรศัพท์"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">สถานะลูกค้า</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="active">ใช้งาน</option>
            <option value="archived">เก็บประวัติ</option>
            <option value="all">ทั้งหมด</option>
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void loadCustomers(1)}
        >
          ค้นหา
        </button>
      </div>

      {error ? <p className="workspace-error">{error}</p> : null}

      <div className="panel product-table-panel" aria-busy={loading}>
        {loading ? (
          <div className="workspace-state">
            <LoaderCircle className="login-spinner" size={24} />
            กำลังโหลดข้อมูล
          </div>
        ) : customers.items.length === 0 ? (
          <div className="workspace-state">ไม่พบลูกค้า</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อลูกค้า</th>
                  <th>โทรศัพท์</th>
                  <th className="table-number">อายุ</th>
                  <th>เพศ</th>
                  <th>สถานะ</th>
                  {canManage ? <th aria-label="การทำงาน" /> : null}
                </tr>
              </thead>
              <tbody>
                {customers.items.map((customer) => (
                  <tr key={customer.id}>
                    <td className="product-code">
                      <Link href={`/customers/${customer.id}`}>
                        {customer.code}
                      </Link>
                    </td>
                    <td>
                      <strong>
                        {customer.firstName} {customer.lastName}
                      </strong>
                    </td>
                    <td>{customer.phone || "-"}</td>
                    <td className="table-number">{customer.age}</td>
                    <td>{genderLabels[customer.gender]}</td>
                    <td>{customer.isActive ? "ใช้งาน" : "เก็บประวัติ"}</td>
                    {canManage ? (
                      <td className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          title="แก้ไขลูกค้า"
                          aria-label={`แก้ไข ${customer.code}`}
                          onClick={() => openEdit(customer)}
                        >
                          <Pencil size={16} />
                        </button>
                        {customer.isActive ? (
                          <button
                            className="icon-button icon-button--danger"
                            type="button"
                            title="เก็บเข้าประวัติ"
                            aria-label={`เก็บ ${customer.code} เข้าประวัติ`}
                            onClick={() => void archiveCustomer(customer)}
                          >
                            <Archive size={16} />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-pagination">
          <span>
            หน้า {customers.page} จาก {totalPages} · {customers.total} รายการ
          </span>
          <div>
            <button
              className="icon-button"
              type="button"
              aria-label="หน้าก่อน"
              disabled={customers.page <= 1 || loading}
              onClick={() => void loadCustomers(customers.page - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="หน้าถัดไป"
              disabled={customers.page >= totalPages || loading}
              onClick={() => void loadCustomers(customers.page + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>

      {drawerOpen ? (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="ปิดฟอร์มลูกค้า"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="form-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}
          >
            <div className="form-drawer__header">
              <div>
                <h2>{editing ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</h2>
                <p>ข้อมูลสำหรับการขายและติดตามประวัติลูกค้า</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="ปิด"
                onClick={() => setDrawerOpen(false)}
              >
                <X size={19} />
              </button>
            </div>
            <form
              className="product-form"
              onSubmit={(event) => void saveCustomer(event)}
            >
              <label>
                รหัสลูกค้า
                <input
                  required
                  maxLength={50}
                  value={form.code}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                ชื่อ
                <input
                  required
                  maxLength={200}
                  value={form.firstName}
                  onChange={(event) =>
                    setForm({ ...form, firstName: event.target.value })
                  }
                />
              </label>
              <label>
                นามสกุล
                <input
                  required
                  maxLength={200}
                  value={form.lastName}
                  onChange={(event) =>
                    setForm({ ...form, lastName: event.target.value })
                  }
                />
              </label>
              <label>
                อายุ
                <input
                  required
                  type="number"
                  min={0}
                  max={150}
                  step={1}
                  value={form.age}
                  onChange={(event) =>
                    setForm({ ...form, age: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                เพศ
                <select
                  value={form.gender}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      gender: event.target.value as CustomerGender
                    })
                  }
                >
                  {Object.entries(genderLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                โทรศัพท์
                <input
                  maxLength={50}
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </label>
              <label>
                วันที่เริ่มเป็นลูกค้า
                <input
                  required
                  type="date"
                  value={form.joinedAt}
                  onChange={(event) =>
                    setForm({ ...form, joinedAt: event.target.value })
                  }
                />
              </label>
              <label>
                ที่อยู่
                <textarea
                  maxLength={1000}
                  rows={4}
                  value={form.address}
                  onChange={(event) =>
                    setForm({ ...form, address: event.target.value })
                  }
                />
              </label>
              <div className="form-drawer__actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "กำลังบันทึก" : "บันทึกลูกค้า"}
                </button>
              </div>
            </form>
          </aside>
        </>
      ) : null}
    </section>
  );
}
