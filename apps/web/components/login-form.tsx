"use client";

import { Archive, LoaderCircle, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password")
        })
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setError(body?.message ?? "ไม่สามารถเข้าสู่ระบบได้");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand__mark" aria-hidden="true">
            <Archive size={25} />
          </span>
          <div>
            <strong>ยู.โอเค คลังสินค้า</strong>
            <span>Warehouse system</span>
          </div>
        </div>

        <div className="login-heading">
          <h1 id="login-title">เข้าสู่ระบบคลังสินค้า</h1>
          <p>บริษัท ยู.โอเค จำกัด</p>
        </div>

        <form
          className="login-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label>
            <span>อีเมล</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              autoFocus
            />
          </label>
          <label>
            <span>รหัสผ่าน</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="login-submit" type="submit" disabled={submitting}>
            {submitting ? (
              <LoaderCircle className="login-spinner" size={18} />
            ) : (
              <LogIn size={18} />
            )}
            เข้าสู่ระบบ
          </button>
        </form>
      </section>
    </main>
  );
}
