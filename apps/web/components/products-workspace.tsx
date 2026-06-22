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
  MasterDataResponse,
  PaginatedProductsResponse,
  ProductResponse
} from "@warehouse/contracts";

interface ProductsWorkspaceProps {
  initialProducts: PaginatedProductsResponse;
  categories: MasterDataResponse[];
  units: MasterDataResponse[];
  canManage: boolean;
  canViewStock: boolean;
}

interface ProductFormState {
  code: string;
  name: string;
  categoryId: string;
  unitId: string;
  salePrice: string;
  lowStockThreshold: number;
}

function emptyForm(
  categories: MasterDataResponse[],
  units: MasterDataResponse[]
): ProductFormState {
  return {
    code: "",
    name: "",
    categoryId: categories[0]?.id ?? "",
    unitId: units[0]?.id ?? "",
    salePrice: "",
    lowStockThreshold: 50
  };
}

function formatThb(value: string): string {
  return `฿${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function ProductsWorkspace({
  initialProducts,
  categories,
  units,
  canManage,
  canViewStock
}: ProductsWorkspaceProps) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProductResponse | null>(null);
  const [form, setForm] = useState(() => emptyForm(categories, units));
  const [saving, setSaving] = useState(false);

  async function loadProducts(page = 1) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(products.pageSize),
      status
    });
    if (search.trim()) params.set("search", search.trim());
    if (categoryId) params.set("categoryId", categoryId);

    try {
      const response = await fetch(`/api/v1/products?${params.toString()}`);
      if (!response.ok) throw new Error("ไม่สามารถโหลดรายการสินค้าได้");
      setProducts((await response.json()) as PaginatedProductsResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ไม่สามารถโหลดรายการสินค้าได้"
      );
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(categories, units));
    setError("");
    setDrawerOpen(true);
  }

  function openEdit(product: ProductResponse) {
    setEditing(product);
    setForm({
      code: product.code,
      name: product.name,
      categoryId: product.category.id,
      unitId: product.unit.id,
      salePrice: product.salePrice,
      lowStockThreshold: product.lowStockThreshold
    });
    setError("");
    setDrawerOpen(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editing ? `/api/v1/products/${editing.id}` : "/api/v1/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form)
        }
      );
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "ไม่สามารถบันทึกสินค้าได้");
      }
      setDrawerOpen(false);
      await loadProducts(editing ? products.page : 1);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "ไม่สามารถบันทึกสินค้าได้"
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(product: ProductResponse) {
    if (
      !window.confirm(`ยืนยันการเก็บสินค้า ${product.code} เข้าคลังประวัติ`)
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/products/${product.id}/archive`, {
        method: "PATCH"
      });
      if (!response.ok) throw new Error("ไม่สามารถเก็บสินค้าเข้าประวัติได้");
      await loadProducts(products.page);
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "ไม่สามารถเก็บสินค้าเข้าประวัติได้"
      );
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(products.total / products.pageSize));

  return (
    <section className="product-workspace">
      <div className="workspace-heading">
        <div>
          <h2>รายการสินค้า</h2>
          <p>จัดการข้อมูลสินค้า หมวดหมู่ หน่วย และจุดแจ้งเตือนสต๊อกต่ำ</p>
        </div>
        {canManage ? (
          <button className="primary-button" type="button" onClick={openCreate}>
            <Plus size={17} />
            เพิ่มสินค้า
          </button>
        ) : null}
      </div>

      <div className="product-toolbar">
        <label className="workspace-search">
          <Search size={17} />
          <span className="sr-only">ค้นหาสินค้า</span>
          <input
            aria-label="ค้นหาสินค้า"
            type="search"
            value={search}
            placeholder="รหัสหรือชื่อสินค้า"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">สถานะสินค้า</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="active">ใช้งาน</option>
            <option value="archived">เก็บประวัติ</option>
            <option value="all">ทั้งหมด</option>
          </select>
        </label>
        <label>
          <span className="sr-only">หมวดหมู่</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void loadProducts(1)}
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
        ) : products.items.length === 0 ? (
          <div className="workspace-state">ไม่พบสินค้า</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ชื่อสินค้า</th>
                  <th>หมวดหมู่</th>
                  <th>หน่วย</th>
                  <th className="table-number">ราคาขาย</th>
                  <th className="table-number">จุดแจ้งเตือน</th>
                  <th>สถานะ</th>
                  {canManage ? <th aria-label="การทำงาน" /> : null}
                </tr>
              </thead>
              <tbody>
                {products.items.map((product) => (
                  <tr key={product.id}>
                    <td className="product-code">
                      {canViewStock ? (
                        <Link href={`/products/${product.id}`}>
                          {product.code}
                        </Link>
                      ) : (
                        product.code
                      )}
                    </td>
                    <td>
                      <strong>{product.name}</strong>
                    </td>
                    <td>{product.category.name}</td>
                    <td>{product.unit.name}</td>
                    <td className="table-number table-money">
                      {formatThb(product.salePrice)}
                    </td>
                    <td className="table-number">
                      {product.lowStockThreshold.toLocaleString("en-US")}
                    </td>
                    <td>{product.isActive ? "ใช้งาน" : "เก็บประวัติ"}</td>
                    {canManage ? (
                      <td className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          title="แก้ไขสินค้า"
                          aria-label={`แก้ไข ${product.code}`}
                          onClick={() => openEdit(product)}
                        >
                          <Pencil size={16} />
                        </button>
                        {product.isActive ? (
                          <button
                            className="icon-button icon-button--danger"
                            type="button"
                            title="เก็บเข้าประวัติ"
                            aria-label={`เก็บ ${product.code} เข้าประวัติ`}
                            onClick={() => void archiveProduct(product)}
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
            หน้า {products.page} จาก {totalPages} · {products.total} รายการ
          </span>
          <div>
            <button
              className="icon-button"
              type="button"
              aria-label="หน้าก่อน"
              disabled={products.page <= 1 || loading}
              onClick={() => void loadProducts(products.page - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="หน้าถัดไป"
              disabled={products.page >= totalPages || loading}
              onClick={() => void loadProducts(products.page + 1)}
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
            aria-label="ปิดฟอร์มสินค้า"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="form-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}
          >
            <div className="form-drawer__header">
              <div>
                <h2>{editing ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</h2>
                <p>ข้อมูลหลักสำหรับใช้งานในคลังและการขาย</p>
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
              onSubmit={(event) => void saveProduct(event)}
            >
              <label>
                รหัสสินค้า
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
                ชื่อสินค้า
                <input
                  required
                  maxLength={200}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label>
                หมวดหมู่
                <select
                  required
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm({ ...form, categoryId: event.target.value })
                  }
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                หน่วย
                <select
                  required
                  value={form.unitId}
                  onChange={(event) =>
                    setForm({ ...form, unitId: event.target.value })
                  }
                >
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ราคาขาย (บาท)
                <input
                  required
                  inputMode="decimal"
                  pattern="\d+(?:\.\d{1,2})?"
                  value={form.salePrice}
                  onChange={(event) =>
                    setForm({ ...form, salePrice: event.target.value })
                  }
                />
              </label>
              <label>
                จุดแจ้งเตือนสต๊อกต่ำ
                <input
                  required
                  type="number"
                  min={0}
                  step={1}
                  value={form.lowStockThreshold}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      lowStockThreshold: Number(event.target.value)
                    })
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
                  {saving ? "กำลังบันทึก" : "บันทึกสินค้า"}
                </button>
              </div>
            </form>
          </aside>
        </>
      ) : null}
    </section>
  );
}
