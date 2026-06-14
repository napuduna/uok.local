# Warehouse System Agent Guide

เอกสารนี้เป็นข้อกำหนดหลักสำหรับ Agent ทุกตัวที่ทำงานใน repository นี้ หากคำสั่งเฉพาะงานขัดกับกฎด้านความถูกต้องของสต๊อก ความปลอดภัย หรือ audit trail ให้หยุดและรายงานความขัดแย้งก่อนแก้ไข code

## Product Goal

สร้างระบบบริหารคลังสินค้า การขาย ลูกค้า ต้นทุน และรายงานสำหรับบริษัท ยู.โอเค จำกัด โดย:

- ใช้งานภาษาไทยเป็นหลักบน desktop และ tablet
- รองรับบริษัทเดียวและคลังหลักหนึ่งแห่งใน MVP
- เตรียม data model ให้เพิ่มหลายคลังได้โดยไม่เปลี่ยน transaction เดิม
- ใช้กำไรขั้นต้น (`gross profit`) เท่ากับยอดขายลบต้นทุนสินค้าที่ขาย
- ใช้ Docker เป็นวิธีมาตรฐานสำหรับ development, test และ production

## Source Of Truth

อ่านเอกสารตามลำดับนี้ก่อนเริ่มงาน:

1. `AGENTS.md` สำหรับกฎระดับ repository
2. `plan.md` สำหรับ architecture, phase, interfaces และ acceptance criteria
3. `.agents/skills/warehouse-system/SKILL.md` สำหรับ workflow การลงมือทำ
4. Code, tests, migrations และ API contract ที่มีอยู่จริง

เมื่อเอกสารกับ code ไม่ตรงกัน ห้ามเดาว่าอย่างใดถูก ให้ตรวจ migrations, tests และประวัติการเปลี่ยนแปลง แล้วรายงานข้อขัดแย้ง

## Architecture

ใช้ TypeScript modular monolith ใน `pnpm` workspace:

```text
apps/
  web/       Next.js web application
  api/       NestJS HTTP API
  worker/    NestJS background jobs
packages/
  database/  Prisma schema, migrations and database client
  contracts/ Shared API schemas and TypeScript types
  ui/        Shared UI components
  config/    Shared lint, TypeScript and test configuration
infra/
  caddy/     Reverse proxy and TLS configuration
  docker/    Container entrypoints and operational scripts
```

Runtime services:

- `proxy`: Caddy reverse proxy และ TLS termination
- `web`: Next.js UI
- `api`: NestJS API และ business transactions
- `worker`: export, report และ backup jobs
- `postgres`: system of record
- `redis`: session, rate-limit และ job queue

ห้ามแยกเป็น microservices โดยไม่มี requirement ที่ได้รับอนุมัติ โมดูล business แยกผ่าน NestJS modules และ public interfaces ภายใน process เดียว

## Domain Modules

- `auth`: login, logout, session และ password policy
- `users`: user lifecycle, roles และ access control
- `products`: product, category, unit และ low-stock threshold
- `inventory`: lots, stock-in, adjustment และ movement ledger
- `sales`: sale, sale items, FIFO allocations, costing และ cancellation
- `customers`: customer profile และ purchase history
- `dashboard`: summary cards, sales trend, gross profit และ alerts
- `reports`: sales, stock, customer, expiry และ gross-profit reports
- `exports`: Excel/PDF generation และ job status
- `backups`: schedule, execution history, retention และ restore evidence
- `audit`: immutable actor/action/resource/change records

แต่ละโมดูลต้องเป็นเจ้าของ rules และ data access ของตนเอง ห้ามให้ controller หรือ React component เขียน business calculation โดยตรง

## Data Rules

- ใช้ UUID เป็น primary key ภายในระบบ
- รหัสที่ผู้ใช้เห็น เช่น product code, lot number และ invoice number ต้อง unique ตามขอบเขตที่กำหนด
- ใช้ ISO-8601 สำหรับ API date/time และเก็บ timestamp ใน UTC; UI แสดง timezone `Asia/Bangkok`
- เงินใช้ PostgreSQL `numeric` และ Prisma `Decimal`; ห้ามใช้ floating-point สำหรับจำนวนเงิน
- จำนวนสินค้าเป็น integer ที่ไม่ติดลบ
- ทุก stock-changing record ต้องผูก `warehouseId` แม้ MVP มีคลังเดียว
- Product มี `lowStockThreshold` ค่าเริ่มต้น 50 และแก้ไขรายสินค้าได้
- Lot มี received date, optional expiry date, unit cost, received quantity และ available quantity
- สินค้าที่หมดอายุ ณ เวลาขายห้ามเข้าสู่ FIFO candidate set
- Product, customer, user และ lot ที่มี transaction ให้ archive/deactivate แทน hard delete

## Inventory Invariants

`InventoryMovement` เป็น ledger แบบ append-only:

- ห้าม update หรือ delete movement ที่บันทึกสำเร็จแล้ว
- การแก้ไขใช้ reversing movement และ transaction ใหม่
- movement ทุกตัวต้องมี type, quantity delta, lot, warehouse, actor, occurred time และ reference
- stock-in และ adjustment ต้องมี business reference; adjustment ต้องมีเหตุผล
- available quantity ของ lot ห้ามต่ำกว่า 0
- aggregate stock ต้องตรวจสอบย้อนกลับได้จาก movement ledger

รายการที่มีผลต่อหลายตารางต้องอยู่ใน PostgreSQL transaction เดียว รวมถึง stock-in, adjustment, sale completion และ sale cancellation

## FIFO And Sales

- เลือก lot ที่ active, ยังไม่หมดอายุ และมีของคงเหลือ
- เรียงด้วย `receivedAt ASC`, จากนั้น `createdAt ASC`, จากนั้น `id ASC`
- Lock candidate rows ด้วย database row lock ก่อนอ่านยอดเพื่อจัดสรร
- สร้าง `SaleAllocation` สำหรับแต่ละคู่ `SaleItem` และ `Lot`
- บันทึก quantity, unit cost และ cost subtotal ลง allocation เพื่อรักษาต้นทุนย้อนหลัง
- หากสต๊อกไม่พอแม้แต่หนึ่งรายการ ให้ rollback ทั้งบิลและตอบ HTTP `409 Conflict`
- Mutation สำคัญต้องรองรับ `Idempotency-Key` และคืนผลเดิมเมื่อ request เดิมถูกส่งซ้ำ
- ยกเลิกได้ทั้งบิลเท่านั้นใน MVP และต้องคืนจำนวนเข้า lot เดิมตาม allocation
- ห้ามแก้ completed sale; ใช้ cancellation แล้วสร้างบิลใหม่

## Authentication And RBAC

บังคับสิทธิ์ที่ API เสมอ การซ่อนเมนูใน UI เป็นเพียง usability ไม่ใช่ security boundary

| Capability            | Admin | Manager | Sales          | Warehouse  |
| --------------------- | ----- | ------- | -------------- | ---------- |
| จัดการผู้ใช้และสิทธิ์ | Allow | Deny    | Deny           | Deny       |
| ดู Dashboard          | Allow | Allow   | Limited        | Limited    |
| จัดการสินค้า          | Allow | Read    | Read           | Allow      |
| รับสินค้าและปรับสต๊อก | Allow | Read    | Deny           | Allow      |
| สร้างและยกเลิกบิลขาย  | Allow | Read    | Allow          | Deny       |
| จัดการลูกค้า          | Allow | Read    | Allow          | Deny       |
| ดู costing และรายงาน  | Allow | Allow   | Own sales only | Stock only |
| Export                | Allow | Allow   | Own sales only | Stock only |
| Backup และ restore    | Allow | Deny    | Deny           | Deny       |
| ดู audit log          | Allow | Read    | Deny           | Deny       |

การเปลี่ยน role, cancellation, adjustment, export และ backup ต้องสร้าง audit record

## API Conventions

- Base path: `/api/v1`
- Resources หลัก: `/auth`, `/users`, `/products`, `/stock-ins`, `/adjustments`, `/sales`, `/customers`, `/dashboard`, `/reports`, `/backups`
- Validate request/response ผ่าน shared schemas ใน `packages/contracts`
- ใช้ pagination แบบ `page`, `pageSize`, `total`, `items`
- Error response ต้องมี `code`, `message`, `details` และ `requestId`
- ห้ามส่ง Prisma model ออกจาก API โดยตรง ให้ map เป็น response DTO
- List endpoints ต้องรองรับ deterministic sorting
- Log ต้องเป็น structured JSON และห้ามบันทึก password, token หรือข้อมูลลับ

## Frontend Conventions

- ใช้ Thai operational UI แบบ sidebar และ table-first
- หน้า list ต้องมี loading, empty, error, pagination และ permission-denied states
- ฟอร์มสั้นใช้ drawer; workflow รับเข้า ปรับสต๊อก และขายใช้หน้าเฉพาะพร้อม confirmation
- ใช้ shared contract จาก `packages/contracts`; ห้ามประกาศ API shape ซ้ำใน component
- ใช้ server-state library ที่โครงการเลือกเพียงชุดเดียว และ invalidate cache หลัง mutation สำเร็จ
- แสดงจำนวนเงินด้วย THB และ date/time ตาม `Asia/Bangkok`
- Tablet ต้องทำ workflow หลักได้ครบ; mobile ต้องไม่เกิด horizontal overflow ที่ทำให้ action ใช้งานไม่ได้

## Docker Workflow

Docker Compose เป็น entry point มาตรฐาน:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api worker
docker compose exec api pnpm prisma:migrate:deploy
docker compose exec api pnpm prisma:seed
docker compose exec api pnpm lint
docker compose exec api pnpm test
docker compose exec api pnpm test:integration
docker compose run --rm --no-deps --build e2e
docker compose run --rm api pnpm test:smoke
docker compose down
```

Production ใช้ Compose override หรือ profiles ที่:

- ไม่ publish PostgreSQL และ Redis ports
- ใช้ named volumes สำหรับ PostgreSQL data, Redis data และ backup artifacts
- ใช้ secrets/environment จาก server ไม่ commit `.env`
- มี healthcheck สำหรับทุก long-running service
- start API หลัง migration สำเร็จ
- restart services ด้วย policy ที่กำหนด

ห้ามใช้ `docker compose down -v`, ลบ volume, restore database หรือ run destructive migration โดยไม่มี explicit approval และ backup ที่ตรวจสอบแล้ว

## Coding And Migration Rules

- เปิด TypeScript strict mode
- ใช้ schema validation ที่ boundary ทุกจุด
- แยก pure domain calculation ออกจาก I/O เพื่อให้ unit test ได้
- ห้าม catch exception แล้วเงียบ; map expected domain errors และ rethrow unexpected errors
- Migration ต้องเป็น forward-only, reviewable และ deploy ได้โดยไม่แก้ไฟล์ migration ที่เคยใช้แล้ว
- การเปลี่ยน column ที่มีข้อมูลใช้ expand-migrate-contract
- Seed ต้อง idempotent และมีเฉพาะข้อมูล development/demo
- ห้ามแก้ generated Prisma client ด้วยมือ
- Dependency ใหม่ต้องมีเหตุผลและไม่ซ้ำ capability ที่มีอยู่

## Test Requirements

- Unit tests: FIFO allocation, costing, expiry, validation และ permission policy
- Integration tests: Prisma repositories และ PostgreSQL transactions จริง
- Concurrency tests: parallel sales ของสินค้าเดียวกันต้องไม่ oversell
- Contract tests: request/response และ error shapes
- E2E tests: critical path แยกตาม role
- Export tests: totals ใน Excel/PDF ตรงกับ query source
- Backup tests: สร้าง backup, verify artifact และ restore drill ใน isolated database

Test fixture มาตรฐานสำหรับ FIFO:

```text
LOT001: available 300, unit cost 20, received first
LOT002: available 1,100, unit cost 22, received second
Sale quantity: 500
Expected allocations: LOT001=300, LOT002=200
Expected cost: 10,400 THB
```

## Definition Of Done

งานถือว่าเสร็จเมื่อ:

1. Behavior ตรง acceptance criteria ใน `plan.md`
2. มี tests ที่ fail ก่อน implementation และ pass หลัง implementation สำหรับ business rule ใหม่
3. Lint, typecheck, unit, integration และ affected E2E tests ผ่านใน Docker
4. Migration ผ่านทั้ง empty database และ database ที่มี fixture เดิม
5. Permission, audit, transaction และ idempotency ได้รับการตรวจสำหรับ mutation
6. ไม่มี stock path ที่ทำให้ quantity ติดลบหรือแก้ ledger ย้อนหลัง
7. Documentation และ API contract ถูกปรับพร้อม code
8. ไม่มี secret, generated artifact, backup หรือ local volume data ถูก commit

ก่อนสรุปงาน ให้รันอย่างน้อย:

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

เพิ่ม Playwright E2E และ restore drill เมื่อ scope งานแตะ workflow เหล่านั้น
