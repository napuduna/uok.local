"use client";

import { AlertTriangle, LoaderCircle, XCircle } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { SaleStatus } from "@warehouse/contracts";

import { createIdempotencyKey } from "../lib/idempotency";

interface SaleCancellationControlProps {
  saleId: string;
  status: SaleStatus;
  canCancel: boolean;
}

export function SaleCancellationControl({
  saleId,
  status,
  canCancel
}: SaleCancellationControlProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!canCancel || status !== "COMPLETED") return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/sales/${saleId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({ reason: reason.trim() })
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "ไม่สามารถยกเลิกบิลได้");
      }
      window.location.reload();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "ไม่สามารถยกเลิกบิลได้"
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        className="danger-button"
        type="button"
        onClick={() => {
          setIdempotencyKey(createIdempotencyKey("sale-cancel"));
          setOpen(true);
        }}
      >
        <XCircle size={16} />
        ยกเลิกบิล
      </button>
    );
  }

  return (
    <form
      className="sale-cancellation-panel"
      onSubmit={(event) => void submit(event)}
    >
      <div>
        <AlertTriangle size={20} />
        <span>
          <strong>ยกเลิกทั้งบิล</strong>
          <small>ระบบจะคืนสินค้าเข้า LOT เดิมทุกรายการ</small>
        </span>
      </div>
      <label>
        เหตุผลการยกเลิก
        <textarea
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error ? <p className="workspace-error">{error}</p> : null}
      <div className="sale-cancellation-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={saving}
          onClick={() => setOpen(false)}
        >
          ปิด
        </button>
        <button
          className="danger-button"
          type="submit"
          disabled={saving || reason.trim().length < 3}
        >
          {saving ? (
            <LoaderCircle className="login-spinner" size={16} />
          ) : (
            <XCircle size={16} />
          )}
          ยืนยันยกเลิกทั้งบิล
        </button>
      </div>
    </form>
  );
}
