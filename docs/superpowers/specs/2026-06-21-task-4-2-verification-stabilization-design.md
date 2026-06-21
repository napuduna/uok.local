# Task 4.2 Verification Stabilization Design

## Context

Task 4.2 is implemented in commit `367c573` on top of the completed report
query layer. The accepted implementation uses BullMQ and Redis, persists an
`ExportJob` and an immutable report snapshot, generates XLSX/PDF artifacts in
the worker, records checksum and audit metadata, enforces requester/role access,
and runs scheduled expiry cleanup.

The implementation remains the source of truth. The alternate uncommitted
export implementation under `C:\tmp\uok-phase2-inventory` is explicitly out of
scope.

## Goal

Make Task 4.2 satisfy its acceptance criteria and the repository verification
gate with deterministic, current evidence.

## Scope

1. Fix the time-dependent export download test by supplying an explicit clock.
   Production expiry behavior remains unchanged.
2. Make the root unit-test command deterministic in constrained Docker/CI
   environments. Workspace package tests will run sequentially while each
   package may continue using its own test runner concurrency.
3. Preserve and strengthen export reconciliation evidence:
   - the API integration test proves the persisted export snapshot totals equal
     the on-screen report totals for identical filters;
   - worker tests prove XLSX and PDF are generated from that snapshot/layout,
     contain the expected totals, use a Thai-capable font, and persist checksum
     metadata;
   - cleanup tests prove expired artifacts are removed and auditable metadata
     remains.
4. Update only vulnerable transitive dependency resolutions required to make
   the existing high-severity dependency audit pass. No new application
   capability is introduced.
5. Run the Task 4.2 unit and integration tests, then the repository Docker
   verification commands. The checklist remains complete only if fresh
   verification passes.

## Non-Goals

- No replacement of BullMQ, Redis, Prisma, ExcelJS, or PDFKit.
- No migration rewrite or change to the `ExportJob` schema.
- No export UI beyond the existing API/worker scope.
- No Phase 5 backup or Google Drive work.
- No cleanup of unrelated worktrees or volumes.

## Data Flow

1. An authorized API request validates `Idempotency-Key`, report type, format,
   filters, and role scope.
2. The API obtains all report pages, persists the complete result snapshot and
   audit record in PostgreSQL, then enqueues the export job ID.
3. The worker reads the persisted snapshot, builds one shared layout, and writes
   XLSX or PDF to the export artifact volume.
4. The worker stores artifact metadata and an audit record. Retried completed
   jobs do not generate a second artifact.
5. The scheduled cleanup removes expired files, marks jobs `EXPIRED`, and keeps
   checksum/audit evidence.

## Error And Security Behavior

- Reusing an idempotency key with different input returns a conflict.
- Queue or generation failures expose only safe error codes/messages.
- Sales and Warehouse exports remain restricted to their report scopes.
- A requester can access their own export; Admin and Manager can access
  company-wide exports.
- Expired artifacts return `410` and are not downloadable.
- Logs and persisted errors do not include secrets or raw internal failures.

## Verification

The minimum evidence is:

- export API/service unit tests;
- worker processor and artifact-generation tests;
- report/export contract tests;
- PostgreSQL and Redis export integration tests;
- migration verification;
- Docker build, lint, typecheck, unit, integration, E2E, and smoke tests;
- `pnpm audit --audit-level high`.

Any failing command is reported as an open Task 4.2 gap rather than being
ignored or reclassified.
