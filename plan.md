# Warehouse Management System Implementation Plan

> **For agentic workers:** ใช้ `.agents/skills/warehouse-system/SKILL.md` และดำเนินงานทีละ task ตามลำดับ dependency ทุก task ใช้ checkbox เพื่อติดตามสถานะ

**Goal:** สร้างระบบคลังสินค้า การขาย ลูกค้า ต้นทุน และรายงานภาษาไทยที่รักษาความถูกต้องของ LOT/FIFO และ deploy บน Linux ด้วย Docker Compose

**Architecture:** ใช้ TypeScript modular monolith ใน `pnpm` monorepo แยก Next.js web, NestJS API, NestJS worker และ shared packages. PostgreSQL เป็น system of record, Prisma เป็น data access layer, Redis รองรับ session และ background jobs, Caddy เป็น reverse proxy/TLS.

**MVP Boundary:** Phase 1-3 เป็น MVP พร้อมใช้งานจริง. Phase 4 เพิ่มรายงานและ export. Phase 5 เพิ่ม scheduled backup, Google Drive option และ production operations.

---

## 1. Product Decisions

- บริษัทเดียวและคลังเดียวใน MVP แต่ stock records ทุกตัวมี `warehouseId`
- UI ภาษาไทย เน้น desktop/tablet และรองรับ mobile สำหรับการดูข้อมูลกับ action พื้นฐาน
- จำนวนสินค้าเป็น integer
- เงินใช้ THB decimal
- บิลขายทั่วไป ชำระเต็มจำนวน ไม่มี VAT, credit term หรือลูกหนี้
- รายงานกำไรใช้ gross profit เท่านั้น
- ยกเลิกได้ทั้งบิลและคืนเข้า LOT เดิม ไม่มี partial return ใน MVP
- สินค้า, LOT, customer และ user ที่มี transaction ใช้ archive ไม่ hard delete
- Low-stock threshold ตั้งรายสินค้า ค่าเริ่มต้น 50
- ไม่รวม barcode, purchase order, Excel import, expense accounting และ multi-warehouse workflow

## 2. Target Repository

```text
.
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── database/
│   ├── contracts/
│   ├── ui/
│   └── config/
├── infra/
│   ├── caddy/
│   └── docker/
├── tests/
│   ├── fixtures/
│   └── smoke/
├── compose.yaml
├── compose.production.yaml
├── pnpm-workspace.yaml
└── package.json
```

### Docker Services

| Service    | Responsibility                   | Public exposure |
| ---------- | -------------------------------- | --------------- |
| `proxy`    | HTTP/HTTPS, routing, TLS         | 80/443          |
| `web`      | Next.js application              | Internal only   |
| `api`      | NestJS REST API                  | Internal only   |
| `worker`   | Queue consumer, exports, backups | Internal only   |
| `postgres` | Transactional database           | Internal only   |
| `redis`    | Session, rate limit, BullMQ      | Internal only   |

ทุก service ต้องมี healthcheck. PostgreSQL และ Redis ใช้ named volumes และห้าม publish port ใน production.

## 3. Public Interfaces

### API Conventions

- Base URL: `/api/v1`
- Authentication: secure HTTP-only session cookie backed by Redis
- Date/time: ISO-8601; database เก็บ UTC และ UI แสดง `Asia/Bangkok`
- IDs: UUID
- Money: JSON string decimal เช่น `"12500.00"`
- Quantity: JSON integer
- Pagination response:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 25,
  "total": 0
}
```

- Error response:

```json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "สินค้าไม่เพียงพอ",
  "details": {},
  "requestId": "uuid"
}
```

- `POST`, cancellation และ adjustment endpoints ที่อาจถูก retry รับ `Idempotency-Key`

### Endpoint Groups

| Path           | Main operations                                      |
| -------------- | ---------------------------------------------------- |
| `/auth`        | login, logout, current session                       |
| `/users`       | list, create, update role, deactivate                |
| `/products`    | CRUD-by-archive, categories, units, stock/lot detail |
| `/stock-ins`   | create and view stock receipts                       |
| `/adjustments` | create increase/decrease adjustments with reason     |
| `/sales`       | quote stock, create sale, list/detail, cancel        |
| `/customers`   | CRUD-by-archive and purchase history                 |
| `/dashboard`   | summary, trends, top products, low-stock alerts      |
| `/reports`     | sales, inventory, expiry, customers, gross profit    |
| `/backups`     | schedules, run, history, artifact verification       |

### Core Data Model

| Entity                                    | Required meaning                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `Warehouse`                               | Stock ownership boundary; seed one default warehouse                    |
| `Product`                                 | Code, name, category, unit, sale price, threshold, active state         |
| `Lot`                                     | Product, warehouse, lot number, received/expiry dates, cost, quantities |
| `InventoryMovement`                       | Append-only stock delta with actor and reference                        |
| `StockIn` / `StockInItem`                 | Receipt header and received lot data                                    |
| `StockAdjustment` / `StockAdjustmentItem` | Count/damage correction with reason                                     |
| `Customer`                                | Profile and purchase history owner                                      |
| `Sale` / `SaleItem`                       | Invoice header and product quantities/prices                            |
| `SaleAllocation`                          | Sale item quantity and cost allocated to a specific lot                 |
| `User` / `Role`                           | Account and one of four fixed roles                                     |
| `AuditLog`                                | Actor, action, resource, before/after metadata and request ID           |
| `ExportJob`                               | Report export status and artifact metadata                              |
| `BackupSchedule` / `BackupRun`            | Backup policy, run result and restore evidence                          |

### Inventory Movement Types

- `STOCK_IN`
- `ADJUSTMENT_IN`
- `ADJUSTMENT_OUT`
- `SALE_OUT`
- `SALE_CANCELLATION_IN`

Movement records are immutable. Corrections create new records with a reference to the original business transaction.

## 4. Phase 1 - Foundation

### Task 1.1: Bootstrap Monorepo

- [x] Create `pnpm` workspace and root scripts for build, lint, typecheck, unit, integration, E2E and smoke tests
- [x] Create Next.js web, NestJS API and NestJS worker applications
- [x] Create shared `database`, `contracts`, `ui` and `config` packages
- [x] Enable TypeScript strict mode, ESLint and consistent formatting
- [x] Add environment schema validation and `.env.example` without secrets
- [x] Add Thai font and baseline responsive application shell

**Acceptance**

- `pnpm install`, lint, typecheck and test commands run from workspace root
- Applications import shared packages without relative cross-app imports
- Invalid or missing required environment values stop service startup with a clear error

### Task 1.2: Build Docker Runtime

- [x] Create multi-stage Dockerfiles for web, API and worker
- [x] Create `compose.yaml` for local development
- [x] Create production override with no database/cache public ports
- [x] Add PostgreSQL and Redis named volumes
- [x] Add Caddy routes for `/api/*` and web traffic
- [x] Add health endpoints and Compose healthchecks
- [x] Add migration entrypoint that completes before API becomes ready

**Acceptance**

- `docker compose config --quiet` exits successfully
- `docker compose up -d --build` reaches healthy state for all services
- Browser reaches web through proxy and API health endpoint returns success
- Restarting containers preserves PostgreSQL data

### Task 1.3: Establish Database And Migrations

- [x] Define Prisma datasource, UUID convention, timestamp convention and Decimal mapping
- [x] Add initial Warehouse, User, Role and AuditLog schema
- [x] Seed default warehouse and one development Admin through idempotent seed logic
- [x] Add migration checks for empty and populated fixture databases
- [x] Provide transaction helper that supports isolation and row-lock queries

**Acceptance**

- Migration deploy succeeds on a clean database and on the previous fixture schema
- Re-running seed does not duplicate warehouse, role or development user
- Database timestamps are UTC and money values never use floating-point

### Task 1.4: Implement Authentication And RBAC

- [x] Implement password hashing, login, logout, current session and session expiry
- [x] Store session state in Redis and set secure HTTP-only cookie policy
- [x] Implement fixed roles: Admin, Manager, Sales and Warehouse
- [x] Implement API guards/policies and shared permission contract
- [x] Implement login page, protected layout and permission-aware navigation
- [x] Audit role changes and account deactivation
- [x] Rate-limit login attempts and record security-relevant failures

**Acceptance**

- Every protected endpoint rejects anonymous requests
- Each role receives only capabilities defined in `AGENTS.md`
- Hidden UI actions remain forbidden when called directly through API
- Deactivated users lose access and existing sessions are invalidated

### Task 1.5: Add Observability And CI

- [x] Add request ID propagation and structured JSON logs
- [x] Add global API error mapping and safe client error responses
- [x] Add CI jobs for Compose config, lint, typecheck, unit and integration tests
- [x] Add secret scanning and dependency audit
- [x] Document local startup, migration and test commands in the root README created with the application

**Acceptance**

- One request ID is visible across proxy, API and worker logs
- Logs exclude password, token, session cookie and secret values
- CI blocks merge when required checks fail

## 5. Phase 2 - Inventory

### Task 2.1: Products And Master Data

- [ ] Implement Product, Category and Unit schema with unique product code
- [ ] Add product list, search, filters, pagination, create, edit and archive endpoints
- [ ] Add Thai table-first UI and form drawer
- [ ] Add per-product low-stock threshold defaulting to 50
- [ ] Prevent archive when an active workflow requires the product

**Acceptance**

- Product code uniqueness is enforced by database and API
- Product with transaction history is archived without deleting history
- Role permissions match the matrix in `AGENTS.md`

### Task 2.2: LOT And Inventory Ledger

- [ ] Implement Lot and append-only InventoryMovement schema
- [ ] Enforce unique lot number within product and warehouse
- [ ] Add product stock summary and lot detail endpoints
- [ ] Add lot list showing received, sold, adjusted and available quantities
- [ ] Add reconciliation query comparing lot availability with movement totals

**Acceptance**

- Movement cannot be updated or deleted through application APIs
- Available quantity cannot become negative
- Product stock total equals sum of active lot available quantities

### Task 2.3: Stock In

- [ ] Implement StockIn aggregate with one or more items
- [ ] Validate product, lot number, received date, expiry date, integer quantity and positive unit cost
- [ ] Create lot and `STOCK_IN` movement atomically
- [ ] Add idempotency handling
- [ ] Add stock-in page with review confirmation and receipt detail
- [ ] Audit creator, request ID and business reference

**Acceptance**

- Duplicate request with the same idempotency key creates one receipt
- Failure on any item rolls back the entire receipt
- New stock appears in product and lot totals immediately after commit

### Task 2.4: Inventory Adjustment

- [ ] Implement increase/decrease adjustment with required reason
- [ ] Require explicit lot selection
- [ ] Lock lot and validate available quantity for decrease
- [ ] Create adjustment and movement atomically
- [ ] Add Warehouse/Admin UI with confirmation
- [ ] Audit actor, reason and before/after quantity

**Acceptance**

- Decrease beyond available quantity returns `409` and changes no data
- Adjustment never edits an earlier movement
- Unauthorized roles receive `403`

### Task 2.5: Low-Stock And Expiry Alerts

- [ ] Implement low-stock query from aggregate available quantity and product threshold
- [ ] Implement expired and expiring-soon lot queries
- [ ] Add alert count and list to Dashboard shell
- [ ] Add deterministic filters and pagination

**Acceptance**

- Threshold comparison uses total available stock for the default warehouse
- Archived products/lots are excluded from active alerts
- Expired lots remain visible in reports but are unavailable for sale

## 6. Phase 3 - Sales MVP

### Task 3.1: Customers

- [ ] Implement customer code, name, surname, age, gender, address, phone and joined date
- [ ] Add list, search, pagination, create, edit and archive
- [ ] Normalize phone search without destroying the stored display value
- [ ] Add purchase-history endpoint and detail page

**Acceptance**

- Sales/Admin can manage customers; Manager has read-only access
- Archived customer history remains attached to existing sales

### Task 3.2: FIFO Allocation Engine

- [ ] Implement a pure allocation function for ordered lot candidates
- [ ] Exclude expired, archived and empty lots
- [ ] Order by `receivedAt`, `createdAt`, then `id`
- [ ] Return allocations or `INSUFFICIENT_STOCK` without partial result
- [ ] Add fixture test for `LOT001=300` and `LOT002=200`
- [ ] Add deterministic tie-order and multi-lot tests

**Acceptance**

- Standard 500-unit fixture costs `10,400.00` THB
- Expired lots are skipped
- Insufficient stock returns a domain error before persistence

### Task 3.3: Transactional Sale Creation

- [ ] Implement invoice number generation with database uniqueness
- [ ] Validate customer, sale items, integer quantity and sale price
- [ ] Open transaction and lock candidate lot rows per product
- [ ] Allocate FIFO and create Sale, SaleItem, SaleAllocation and `SALE_OUT` movements
- [ ] Snapshot unit cost and subtotal on every allocation
- [ ] Add idempotency handling and `409` mapping
- [ ] Add parallel integration test for competing sales

**Acceptance**

- Any item failure rolls back the complete invoice
- Concurrent requests cannot oversell or create negative lot quantity
- Retrying the same request does not create a second invoice
- Invoice detail lists every allocated lot, quantity, sale price, cost and gross profit

### Task 3.4: Sales UI And History

- [ ] Build sale workspace with customer selection and searchable product rows
- [ ] Show availability, quantity, price and order total before confirmation
- [ ] Prevent duplicate submit while preserving idempotency key on retry
- [ ] Build sales list with date/customer/invoice filters and pagination
- [ ] Build invoice detail with lot allocations, cost and gross profit
- [ ] Apply Sales own-sales visibility policy

**Acceptance**

- Desktop/tablet workflow completes without hidden required fields
- API error preserves entered form data and explains the affected product
- Totals displayed before and after save use the same decimal rules

### Task 3.5: Whole-Invoice Cancellation

- [ ] Permit cancellation only for completed, non-cancelled invoices
- [ ] Lock sale and allocated lots
- [ ] Restore quantities to the exact original lots
- [ ] Create `SALE_CANCELLATION_IN` movements and cancellation audit
- [ ] Keep original sale/allocation values immutable
- [ ] Require cancellation reason and Admin/Sales permission

**Acceptance**

- Cancelling the standard fixture restores 300 to LOT001 and 200 to LOT002
- Repeated cancellation cannot restore stock twice
- Cancellation and restoration commit or rollback together

### Task 3.6: Dashboard And Costing

- [ ] Add cards for product count, stock quantity, today/month sales, customers and low-stock count
- [ ] Add daily/monthly sales, top products and monthly gross-profit queries
- [ ] Add inventory value from available quantity multiplied by lot unit cost
- [ ] Add sold cost from allocation snapshots
- [ ] Apply role-specific visibility

**Acceptance**

- Dashboard totals reconcile with sales and inventory detail queries
- All profit labels say gross profit
- Sales role cannot access company-wide costing not granted by policy

### MVP Release Gate

- [ ] Run full lint, typecheck, unit, integration and Playwright suites in Docker
- [ ] Run FIFO and concurrent-sale tests repeatedly without oversell
- [ ] Verify RBAC allow/deny matrix through API tests
- [ ] Verify migration from the previous release fixture
- [ ] Run backup of the MVP database before production migration
- [ ] Complete smoke test through the proxy

MVP is releasable only when all Phase 1-3 acceptance criteria and this gate pass.

## 7. Phase 4 - Reports And Export

### Task 4.1: Report Query Layer

- [ ] Implement date-range sales reports grouped daily, monthly and yearly
- [ ] Implement current stock, low-stock, expired and expiring reports
- [ ] Implement top-customer and new-customer reports
- [ ] Implement daily, monthly and yearly gross-profit reports
- [ ] Apply role-scoped filters before aggregation

**Acceptance**

- Every report total reconciles with source transactions
- Date boundaries use `Asia/Bangkok` business dates over UTC storage
- Pagination and sorting are deterministic

### Task 4.2: Background Export

- [ ] Implement BullMQ export jobs through Redis
- [ ] Persist ExportJob status, requester, filters, file checksum and expiry
- [ ] Generate Excel and PDF from the same report query result
- [ ] Use Thai-capable fonts and stable table layout
- [ ] Restrict download to authorized requester/role
- [ ] Remove expired artifacts through scheduled cleanup

**Acceptance**

- Excel/PDF totals equal on-screen report totals for identical filters
- Worker retries do not create conflicting completed jobs
- Failed job exposes a safe error and remains auditable

## 8. Phase 5 - Backup And Operations

### Task 5.1: Backup Scheduler

- [ ] Implement daily, weekly and monthly schedule choices
- [ ] Run PostgreSQL logical backup from worker with one active run per schedule
- [ ] Store artifact size, checksum, status, timestamps and failure message
- [ ] Add configurable retention policy
- [ ] Add Admin-only schedule and history UI

**Acceptance**

- Backup history shows success/failure and artifact metadata
- Concurrent scheduler ticks do not create duplicate runs
- Backup secrets and artifacts are outside Git

### Task 5.2: Google Drive Destination

- [ ] Add optional Google Drive destination configuration
- [ ] Encrypt or externally manage credentials
- [ ] Upload with retry and verify remote checksum/size
- [ ] Record remote object ID without exposing credentials
- [ ] Keep local fallback behavior explicit when upload fails

**Acceptance**

- Admin can distinguish local success from remote upload success
- Retry does not create uncontrolled duplicate remote files

### Task 5.3: Restore Runbook And Drill

- [ ] Add restore command targeting a new isolated database
- [ ] Verify checksum before restore
- [ ] Run migration compatibility and smoke checks after restore
- [ ] Record restore drill date, source backup and result
- [ ] Document production recovery order for database, Redis/session reset, API and worker

**Acceptance**

- Latest scheduled backup restores into an isolated database successfully
- Smoke tests read expected products, lots, sales and allocations
- Production restore requires explicit operator confirmation and never overwrites by default

### Task 5.4: Production Hardening

- [ ] Configure TLS, security headers, trusted proxy and download limits
- [ ] Configure CPU/memory limits, restart policy and log rotation
- [ ] Add database connection limits and slow-query visibility
- [ ] Add external uptime and backup-failure alerts
- [ ] Document deploy, rollback and incident procedures

**Acceptance**

- Only proxy ports are publicly reachable
- Service restart preserves durable data and resumes workers safely
- Rollback does not apply destructive reverse migrations

## 9. Required Test Scenarios

| Scenario                                     | Expected result                                |
| -------------------------------------------- | ---------------------------------------------- |
| Sell 500 with LOT001=300 and LOT002=1,100    | Allocate 300/200; cost 10,400 THB              |
| Two concurrent sales compete for final stock | Successful total never exceeds available stock |
| Oldest lot is expired                        | Skip it and allocate from next valid lot       |
| One item in a multi-item sale lacks stock    | Entire invoice rolls back                      |
| Same idempotency key is retried              | Return original result; no duplicate movement  |
| Cancel completed sale                        | Restore exact original lots once               |
| Decrease adjustment exceeds lot balance      | Return 409; create no adjustment or movement   |
| Sales calls Admin user endpoint              | Return 403                                     |
| Export and screen use same filters           | Totals and row meaning match                   |
| Restore latest backup to isolated database   | Restore and smoke checks pass                  |

## 10. Verification Commands

เมื่อ application files ถูกสร้างแล้ว ให้ project scripts รองรับคำสั่งต่อไปนี้:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
docker compose run --rm api pnpm lint
docker compose run --rm api pnpm typecheck
docker compose run --rm api pnpm test
docker compose run --rm api pnpm test:integration
docker compose run --rm --no-deps --build e2e
docker compose run --rm api pnpm test:smoke
```

Phase 4 ต้องเพิ่ม export reconciliation test. Phase 5 ต้องเพิ่ม isolated restore drill.

## 11. Completion Rules

- ทำ phase ตามลำดับ dependency และรักษาระบบให้อยู่ในสถานะ deployable หลังแต่ละ task
- Commit แยกตาม behavior ที่ทดสอบได้ ไม่รวม refactor ที่ไม่เกี่ยวข้อง
- เปลี่ยน API/schema พร้อม contracts, migrations, tests และ documentation ในชุดเดียว
- ห้ามประกาศ task สำเร็จจาก code review อย่างเดียว ต้องมี fresh verification output
- หาก requirement ใหม่แตะ VAT, credit sales, receivables, partial returns, multi-warehouse, barcode, purchase order หรือ expense accounting ให้หยุดและออกแบบ phase ใหม่ก่อน implementation
