# Background Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม background export สำหรับรายงาน Phase 4 เป็น Excel/PDF ผ่าน BullMQ พร้อมสถานะงาน, audit trail, authorization, checksum, expiry และ scheduled cleanup

**Architecture:** API ใช้ `ReportsService` เดิมสร้าง report snapshot แบบครบทุกหน้า แล้วบันทึก snapshot และ filters ใน `ExportJob` ก่อน enqueue BullMQ job ด้วย `jobId` เดียวกับ export ID. Worker สร้าง artifact จาก snapshot เดิมลง named volume ที่แชร์กับ API ทำให้ retry เป็น idempotent และ Excel/PDF ใช้ข้อมูล source เดียวกัน; cleanup scheduler ลบไฟล์หมดอายุและเปลี่ยนสถานะเป็น `EXPIRED`.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ/Redis, ExcelJS, PDFKit, Vitest, Docker Compose

---

### Task 1: Export contracts and persistence

**Files:**
- Create: `packages/contracts/src/export.ts`
- Create: `packages/contracts/src/export.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/000011_background_exports/migration.sql`

- [ ] **Step 1: Write failing contract tests**

Test request parsing for report type, format, report-specific filters and response status metadata. Reject inventory filters on sales reports and invalid date ranges.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `pnpm --filter @warehouse/contracts test -- export.test.ts`

Expected: FAIL because export schemas do not exist.

- [ ] **Step 3: Add contracts and Prisma model**

Add `ExportReportType`, `ExportFormat`, `ExportJobStatus`, request/response schemas and an `ExportJob` model containing requester, requester role, filters, result snapshot, idempotency hash, status, artifact metadata, checksum, expiry, safe error and timestamps.

- [ ] **Step 4: Generate Prisma client and run contract tests**

Run: `pnpm prisma:generate`

Run: `pnpm --filter @warehouse/contracts test -- export.test.ts`

Expected: PASS.

### Task 2: API creation, status and download authorization

**Files:**
- Create: `apps/api/src/exports/exports.controller.ts`
- Create: `apps/api/src/exports/exports.module.ts`
- Create: `apps/api/src/exports/exports.service.ts`
- Create: `apps/api/src/exports/export-queue.service.ts`
- Create: `apps/api/src/exports/exports.service.test.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write failing service tests**

Cover:

- SALES may export only own sales/gross-profit/customer reports.
- WAREHOUSE may export only stock reports.
- ADMIN/MANAGER may export all allowed report categories.
- duplicate `Idempotency-Key` with identical input returns the same job.
- reused key with different input returns conflict.
- status/download is requester-only unless the caller has `EXPORT_ALL`.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @warehouse/api test -- exports.service.test.ts`

Expected: FAIL because exports module does not exist.

- [ ] **Step 3: Implement snapshot collection and enqueue**

Expose an internal report collection method that walks deterministic report pages and preserves the report-level totals. Create `ExportJob` and `EXPORT_REQUESTED` audit record in one database transaction, then add BullMQ job `generate-export` with:

```ts
{
  jobId: exportJob.id,
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 1000
}
```

On enqueue failure, persist `FAILED` with safe code `EXPORT_QUEUE_UNAVAILABLE`.

- [ ] **Step 4: Add HTTP endpoints**

Add:

```text
POST /api/v1/exports
GET  /api/v1/exports/:id
GET  /api/v1/exports/:id/download
```

Require session authentication plus export permissions, `Idempotency-Key` for creation, and stream only completed, unexpired artifacts.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @warehouse/api test -- exports.service.test.ts`

Expected: PASS.

### Task 3: Excel/PDF artifact generation

**Files:**
- Create: `apps/worker/src/exports/export-artifact.generator.ts`
- Create: `apps/worker/src/exports/export-artifact.generator.test.ts`
- Create: `apps/worker/src/exports/export-layout.ts`
- Modify: `apps/worker/package.json`

- [ ] **Step 1: Write failing generator tests**

Generate XLSX and PDF from the same snapshot and assert:

- both artifacts are non-empty;
- XLSX totals match snapshot totals;
- PDF text contains the same formatted totals;
- Thai report title is accepted using the configured Thai font;
- deterministic filename uses export ID and format.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @warehouse/worker test -- export-artifact.generator.test.ts`

Expected: FAIL because generator does not exist.

- [ ] **Step 3: Implement stable layouts**

Use ExcelJS worksheets with fixed Thai headers, widths, frozen header row and numeric money cells. Use PDFKit with `EXPORT_THAI_FONT_PATH`, fixed margins, repeated table headers and page breaks. Write through a temporary file and atomically rename to the deterministic final path.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @warehouse/worker test -- export-artifact.generator.test.ts`

Expected: PASS.

### Task 4: BullMQ worker and cleanup

**Files:**
- Create: `apps/worker/src/database/database.service.ts`
- Create: `apps/worker/src/exports/exports.module.ts`
- Create: `apps/worker/src/exports/export-worker.service.ts`
- Create: `apps/worker/src/exports/export-worker.service.test.ts`
- Modify: `apps/worker/src/app.module.ts`
- Modify: `packages/config/src/environment.ts`
- Modify: `packages/config/src/environment.test.ts`
- Modify: `apps/worker/package.json`

- [ ] **Step 1: Write failing worker tests**

Cover completed-job idempotency, retry using the stored snapshot, safe failure persistence, SHA-256 checksum persistence and expiry cleanup.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter @warehouse/worker test -- export-worker.service.test.ts`

Expected: FAIL because worker service does not exist.

- [ ] **Step 3: Implement queue consumer**

Process `generate-export` using the export ID only. If the database row is already `COMPLETED`, return without writing another artifact. Otherwise mark `PROCESSING`, generate, hash, then persist `COMPLETED`; on error persist a safe `FAILED` message and throw an `Error` so BullMQ retries.

- [ ] **Step 4: Implement scheduled cleanup**

Use BullMQ `upsertJobScheduler` with an hourly `cleanup-expired-exports` job. Delete expired files, retain audit metadata/checksum, clear the artifact path and mark the row `EXPIRED`.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @warehouse/worker test`

Expected: PASS.

### Task 5: Docker wiring and integration acceptance

**Files:**
- Modify: `compose.yaml`
- Modify: `compose.production.yaml`
- Modify: `.env.example`
- Modify: `infra/docker/node.Dockerfile`
- Create: `apps/api/test/exports.integration.test.ts`
- Modify: `README.md`
- Modify: `plan.md`

- [ ] **Step 1: Write failing integration tests**

Test API creation/status/download, role restrictions, audit creation, identical report/export totals, retry idempotency and expired artifact denial.

- [ ] **Step 2: Wire runtime dependencies**

Mount `export_artifacts` at `/var/lib/uok/exports` in API and worker, set `EXPORT_ARTIFACT_DIR`, install a Thai-capable Noto font in the runtime image and set `EXPORT_THAI_FONT_PATH`.

- [ ] **Step 3: Run migration verification**

Run: `docker compose run --rm api pnpm prisma:migrate:verify`

Expected: empty and populated fixture migration checks pass.

- [ ] **Step 4: Run export reconciliation and regression tests**

Run:

```bash
docker compose run --rm api pnpm test
docker compose run --rm api pnpm test:integration
docker compose run --rm worker pnpm test
```

Expected: PASS with exported totals equal to report query totals.

- [ ] **Step 5: Run repository verification**

Run:

```bash
docker compose config --quiet
docker compose build
docker compose run --rm api pnpm lint
docker compose run --rm api pnpm typecheck
docker compose run --rm api pnpm test
docker compose run --rm api pnpm test:integration
docker compose run --rm --no-deps --build e2e
docker compose run --rm api pnpm test:smoke
```

Expected: all commands exit 0.

- [ ] **Step 6: Mark Task 4.2 complete only after fresh evidence**

Check all Task 4.2 boxes in `plan.md` only when the focused export tests and required Docker verification pass.
