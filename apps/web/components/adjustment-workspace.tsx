"use client";

import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  SlidersHorizontal
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  inventoryAdjustmentResponseSchema,
  paginatedLotsResponseSchema,
  type InventoryAdjustmentDirection,
  type InventoryAdjustmentResponse,
  type LotResponse,
  type ProductResponse
} from "@warehouse/contracts";

import { createIdempotencyKey } from "../lib/idempotency";

interface AdjustmentWorkspaceProps {
  products: ProductResponse[];
}

export function AdjustmentWorkspace({
  products
}: AdjustmentWorkspaceProps) {
  const [referenceNumber, setReferenceNumber] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [lots, setLots] = useState<LotResponse[]>([]);
  const [lotId, setLotId] = useState("");
  const [direction, setDirection] =
    useState<InventoryAdjustmentDirection>("DECREASE");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"form" | "review" | "receipt">("form");
  const [receipt, setReceipt] =
    useState<InventoryAdjustmentResponse | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [loadingLots, setLoadingLots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedLot = useMemo(
    () => lots.find((lot) => lot.id === lotId) ?? null,
    [lotId, lots]
  );
  const quantityNumber = Number(quantity);
  const afterQuantity = selectedLot
    ? selectedLot.availableQuantity +
      (direction === "INCREASE" ? quantityNumber : -quantityNumber)
    : 0;

  useEffect(() => {
    if (!productId) {
      setLots([]);
      setLotId("");
      return;
    }

    const abortController = new AbortController();
    setLoadingLots(true);
    setError("");
    setLotId("");
    void fetch(
      `/api/v1/products/${productId}/lots?page=1&pageSize=100&status=active`,
      { signal: abortController.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("ไม่สามารถโหลด LOT ได้");
        return paginatedLotsResponseSchema.parse(await response.json());
      })
      .then((response) => setLots(response.items))
      .catch((loadError: unknown) => {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }
        setLots([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "ไม่สามารถโหลด LOT ได้"
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoadingLots(false);
      });

    return () => abortController.abort();
  }, [productId]);

  function openReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLot) {
      setError("กรุณาเลือก LOT");
      return;
    }
    if (direction === "DECREASE" && afterQuantity < 0) {
      setError("จำนวนสินค้าคงเหลือไม่เพียงพอ");
      return;
    }
    setError("");
    setIdempotencyKey(createIdempotencyKey("adjustment"));
    setStep("review");
  }

  async function confirmAdjustment() {
    if (!selectedLot) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/adjustments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          referenceNumber,
          lotId: selectedLot.id,
          direction,
          quantity: quantityNumber,
          reason
        })
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "ไม่สามารถปรับสต๊อกได้");
      }
      setReceipt(
        inventoryAdjustmentResponseSchema.parse(await response.json())
      );
      setStep("receipt");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "ไม่สามารถปรับสต๊อกได้"
      );
    } finally {
      setSaving(false);
    }
  }

  if (step === "receipt" && receipt) {
    return (
      <section className="adjustment-workspace">
        <div className="stock-in-success">
          <CheckCircle2 size={38} />
          <div>
            <span>ปรับสต๊อกเรียบร้อย</span>
            <h2>{receipt.referenceNumber}</h2>
            <p>
              {receipt.product.code} · {receipt.lot.lotNumber}
            </p>
          </div>
        </div>
        <div className="panel adjustment-result">
          <div>
            <span>ก่อนปรับ</span>
            <strong>{receipt.beforeQuantity} ชิ้น</strong>
          </div>
          <div>
            <span>เปลี่ยนแปลง</span>
            <strong>
              {receipt.quantityDelta > 0 ? "+" : ""}
              {receipt.quantityDelta} ชิ้น
            </strong>
          </div>
          <div>
            <span>หลังปรับ</span>
            <strong>{receipt.afterQuantity} ชิ้น</strong>
          </div>
          <p>{receipt.reason}</p>
        </div>
        <button
          className="primary-button adjustment-new-button"
          type="button"
          onClick={() => {
            setReferenceNumber("");
            setLotId("");
            setQuantity("");
            setReason("");
            setReceipt(null);
            setStep("form");
          }}
        >
          <SlidersHorizontal size={17} />
          ปรับสต๊อกรายการใหม่
        </button>
      </section>
    );
  }

  if (step === "review" && selectedLot) {
    return (
      <section className="adjustment-workspace">
        <div className="workspace-heading">
          <div>
            <h2>ตรวจสอบก่อนปรับสต๊อก</h2>
            <p>
              {referenceNumber} · {selectedLot.product.code} ·{" "}
              {selectedLot.lotNumber}
            </p>
          </div>
        </div>
        {error ? <p className="workspace-error">{error}</p> : null}
        <div className="panel adjustment-review">
          <div className="adjustment-review__summary">
            <div>
              <span>ก่อนปรับ</span>
              <strong>{selectedLot.availableQuantity} ชิ้น</strong>
            </div>
            <div>
              <span>{direction === "INCREASE" ? "เพิ่ม" : "ลด"}</span>
              <strong>
                {direction === "INCREASE" ? "+" : "-"}
                {quantityNumber} ชิ้น
              </strong>
            </div>
            <div>
              <span>หลังปรับ</span>
              <strong>{afterQuantity} ชิ้น</strong>
            </div>
          </div>
          <dl className="adjustment-review__detail">
            <div>
              <dt>คลัง</dt>
              <dd>{selectedLot.warehouse.name}</dd>
            </div>
            <div>
              <dt>LOT</dt>
              <dd>{selectedLot.lotNumber}</dd>
            </div>
            <div>
              <dt>เหตุผล</dt>
              <dd>{reason}</dd>
            </div>
          </dl>
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
            onClick={() => void confirmAdjustment()}
          >
            {saving ? (
              <LoaderCircle className="login-spinner" size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            ยืนยันปรับสต๊อก
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="adjustment-workspace">
      <div className="workspace-heading">
        <div>
          <h2>ปรับสต๊อกสินค้า</h2>
          <p>เลือก LOT และระบุเหตุผลทุกครั้ง</p>
        </div>
      </div>
      {error ? <p className="workspace-error">{error}</p> : null}
      <form className="adjustment-form" onSubmit={openReview}>
        <div className="panel adjustment-fields">
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
            สินค้า
            <select
              required
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
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
            <select
              required
              value={lotId}
              disabled={loadingLots || lots.length === 0}
              onChange={(event) => setLotId(event.target.value)}
            >
              <option value="">
                {loadingLots
                  ? "กำลังโหลด LOT..."
                  : lots.length === 0
                    ? "ไม่มี LOT ที่ใช้งานได้"
                    : "เลือก LOT"}
              </option>
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lotNumber} · คงเหลือ {lot.availableQuantity}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="adjustment-direction">
            <legend>ประเภทการปรับ</legend>
            <label>
              <input
                type="radio"
                name="direction"
                value="INCREASE"
                checked={direction === "INCREASE"}
                onChange={() => setDirection("INCREASE")}
              />
              <span>เพิ่มสต๊อก</span>
            </label>
            <label>
              <input
                type="radio"
                name="direction"
                value="DECREASE"
                checked={direction === "DECREASE"}
                onChange={() => setDirection("DECREASE")}
              />
              <span>ลดสต๊อก</span>
            </label>
          </fieldset>
          <label>
            จำนวน
            <input
              required
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <label className="adjustment-reason">
            เหตุผล
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </div>
        <div className="stock-in-actions">
          <button
            className="primary-button"
            type="submit"
            disabled={!products.length || loadingLots}
          >
            ตรวจสอบรายการ
          </button>
        </div>
      </form>
    </section>
  );
}
