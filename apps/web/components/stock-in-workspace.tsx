"use client";

import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Trash2
} from "lucide-react";
import { type FormEvent, useState } from "react";

import type { ProductResponse, StockInResponse } from "@warehouse/contracts";

import { createIdempotencyKey } from "../lib/idempotency";

interface StockInWorkspaceProps {
  products: ProductResponse[];
}

interface StockInItemForm {
  productId: string;
  lotNumber: string;
  expiryDate: string;
  quantity: string;
  unitCost: string;
}

function todayInBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok"
  }).format(new Date());
}

function toBangkokIso(date: string): string {
  return `${date}T00:00:00+07:00`;
}

function newItem(products: ProductResponse[]): StockInItemForm {
  return {
    productId: products[0]?.id ?? "",
    lotNumber: "",
    expiryDate: "",
    quantity: "",
    unitCost: ""
  };
}

export function StockInWorkspace({ products }: StockInWorkspaceProps) {
  const [referenceNumber, setReferenceNumber] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayInBangkok);
  const [items, setItems] = useState<StockInItemForm[]>(() => [
    newItem(products)
  ]);
  const [step, setStep] = useState<"form" | "review" | "receipt">("form");
  const [receipt, setReceipt] = useState<StockInResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  function updateItem(index: number, patch: Partial<StockInItemForm>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function openReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIdempotencyKey(createIdempotencyKey("stock-in"));
    setStep("review");
  }

  async function confirmStockIn() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/stock-ins", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          referenceNumber,
          receivedAt: toBangkokIso(receivedDate),
          items: items.map((item) => ({
            productId: item.productId,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate ? toBangkokIso(item.expiryDate) : null,
            quantity: Number(item.quantity),
            unitCost: item.unitCost
          }))
        })
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "ไม่สามารถรับสินค้าได้");
      }
      setReceipt((await response.json()) as StockInResponse);
      setStep("receipt");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "ไม่สามารถรับสินค้าได้"
      );
    } finally {
      setSaving(false);
    }
  }

  if (step === "receipt" && receipt) {
    return (
      <section className="stock-in-workspace">
        <div className="stock-in-success">
          <CheckCircle2 size={38} />
          <div>
            <span>รับสินค้าเรียบร้อย</span>
            <h2>{receipt.referenceNumber}</h2>
            <p>
              {receipt.warehouse.name} · {receipt.items.length} รายการ
            </p>
          </div>
        </div>
        <div className="panel receipt-panel">
          <div className="panel-heading">
            <div>
              <h3>รายละเอียดการรับสินค้า</h3>
              <p>LOT และ movement ถูกบันทึกใน transaction เดียวกัน</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>LOT</th>
                  <th className="table-number">จำนวน</th>
                  <th className="table-number">ต้นทุน/หน่วย</th>
                  <th className="table-number">คงเหลือ</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.product.code}</strong> {item.product.name}
                    </td>
                    <td className="product-code">{item.lotNumber}</td>
                    <td className="table-number">{item.quantity}</td>
                    <td className="table-number">฿{item.unitCost}</td>
                    <td className="table-number">{item.availableQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button
          className="primary-button stock-in-new-button"
          type="button"
          onClick={() => {
            setReferenceNumber("");
            setItems([newItem(products)]);
            setReceipt(null);
            setStep("form");
          }}
        >
          <Plus size={17} />
          รับสินค้าใหม่
        </button>
      </section>
    );
  }

  if (step === "review") {
    return (
      <section className="stock-in-workspace">
        <div className="workspace-heading">
          <div>
            <h2>ตรวจสอบก่อนรับสินค้า</h2>
            <p>
              {referenceNumber} · วันที่รับ {receivedDate}
            </p>
          </div>
        </div>
        {error ? <p className="workspace-error">{error}</p> : null}
        <div className="panel receipt-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>สินค้า</th>
                  <th>LOT</th>
                  <th>หมดอายุ</th>
                  <th className="table-number">จำนวน</th>
                  <th className="table-number">ต้นทุน/หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const product = products.find(
                    (candidate) => candidate.id === item.productId
                  );
                  return (
                    <tr key={`${item.productId}-${item.lotNumber}-${index}`}>
                      <td>
                        <strong>{product?.code}</strong> {product?.name}
                      </td>
                      <td className="product-code">{item.lotNumber}</td>
                      <td>{item.expiryDate || "ไม่กำหนด"}</td>
                      <td className="table-number">{item.quantity}</td>
                      <td className="table-number">฿{item.unitCost}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stock-in-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={saving}
            onClick={() => setStep("form")}
          >
            <ArrowLeft size={16} />
            กลับไปแก้ไข
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={saving}
            onClick={() => void confirmStockIn()}
          >
            {saving ? (
              <LoaderCircle className="login-spinner" size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            ยืนยันรับสินค้า
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stock-in-workspace">
      <div className="workspace-heading">
        <div>
          <h2>รับสินค้าเข้า</h2>
          <p>สร้าง LOT และ movement จากเอกสารรับสินค้าเดียวกัน</p>
        </div>
      </div>
      {error ? <p className="workspace-error">{error}</p> : null}
      <form className="stock-in-form" onSubmit={openReview}>
        <div className="stock-in-document-fields">
          <label>
            เลขที่อ้างอิง
            <input
              required
              maxLength={100}
              value={referenceNumber}
              onChange={(event) =>
                setReferenceNumber(event.target.value.toUpperCase())
              }
            />
          </label>
          <label>
            วันที่รับสินค้า
            <input
              required
              type="date"
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
            />
          </label>
        </div>

        <div className="panel stock-in-items-panel">
          <div className="panel-heading">
            <div>
              <h3>รายการสินค้า</h3>
              <p>หนึ่งรายการสร้างหนึ่ง LOT</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setItems((current) => [...current, newItem(products)])
              }
            >
              <Plus size={16} />
              เพิ่มรายการ
            </button>
          </div>
          <div className="stock-in-item-list">
            {items.map((item, index) => (
              <div className="stock-in-item-row" key={index}>
                <label>
                  สินค้า
                  <select
                    required
                    aria-label={`สินค้า รายการ ${index + 1}`}
                    value={item.productId}
                    onChange={(event) =>
                      updateItem(index, { productId: event.target.value })
                    }
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.code} · {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  LOT
                  <input
                    required
                    maxLength={100}
                    aria-label={`LOT รายการ ${index + 1}`}
                    value={item.lotNumber}
                    onChange={(event) =>
                      updateItem(index, {
                        lotNumber: event.target.value.toUpperCase()
                      })
                    }
                  />
                </label>
                <label>
                  วันหมดอายุ
                  <input
                    type="date"
                    aria-label={`วันหมดอายุ รายการ ${index + 1}`}
                    min={receivedDate}
                    value={item.expiryDate}
                    onChange={(event) =>
                      updateItem(index, { expiryDate: event.target.value })
                    }
                  />
                </label>
                <label>
                  จำนวน
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    aria-label={`จำนวน รายการ ${index + 1}`}
                    value={item.quantity}
                    onChange={(event) =>
                      updateItem(index, { quantity: event.target.value })
                    }
                  />
                </label>
                <label>
                  ต้นทุนต่อหน่วย
                  <input
                    required
                    inputMode="decimal"
                    pattern="\d+(?:\.\d{1,2})?"
                    aria-label={`ต้นทุนต่อหน่วย รายการ ${index + 1}`}
                    value={item.unitCost}
                    onChange={(event) =>
                      updateItem(index, { unitCost: event.target.value })
                    }
                  />
                </label>
                <button
                  className="icon-button icon-button--danger stock-in-remove"
                  type="button"
                  title="ลบรายการ"
                  aria-label={`ลบรายการ ${index + 1}`}
                  disabled={items.length === 1}
                  onClick={() =>
                    setItems((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="stock-in-actions">
          <button className="primary-button" type="submit">
            ตรวจสอบรายการ
          </button>
        </div>
      </form>
    </section>
  );
}
