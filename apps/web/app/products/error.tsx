"use client";

export default function ProductsError({ reset }: { reset: () => void }) {
  return (
    <main className="standalone-state">
      <h1>ไม่สามารถโหลดรายการสินค้าได้</h1>
      <button className="primary-button" type="button" onClick={reset}>
        ลองอีกครั้ง
      </button>
    </main>
  );
}
