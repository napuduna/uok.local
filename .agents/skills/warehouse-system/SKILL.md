---
name: warehouse-system
description: Implement, review, test, or plan features in the Docker-based warehouse management repository, especially authentication/RBAC, products, lots, stock-in, inventory adjustments, FIFO sales, customers, costing, reports, exports, backups, Prisma migrations, and Docker operations.
---

# Warehouse System Workflow

ทำงานตามขั้นตอนนี้ทุกครั้งเพื่อรักษาความถูกต้องของสต๊อก ต้นทุน และ audit trail

## 1. Establish Context

1. อ่าน `AGENTS.md` ทั้งไฟล์
2. อ่าน phase และ acceptance criteria ที่เกี่ยวข้องใน `plan.md`
3. ตรวจ code, tests, Prisma schema, migrations และ Docker configuration ที่มีอยู่
4. ตรวจ `git status` และรักษา changes ที่ไม่ได้สร้างเอง
5. ระบุ modules, interfaces และ invariants ที่งานจะกระทบ

หาก repository ยังไม่มี application ให้เริ่มจาก Phase 1 ใน `plan.md` เท่านั้น ห้ามสร้าง feature phase หลังโดยข้าม foundation ที่เป็น dependency

## 2. Select The Smallest Deliverable

- เลือก task ที่เล็กที่สุดซึ่งทำให้ระบบมี behavior ที่ทดสอบได้
- ทำงานตาม phase order เว้นแต่ dependency ก่อนหน้าผ่าน acceptance criteria แล้ว
- หลีกเลี่ยง refactor ที่ไม่จำเป็นต่อ acceptance criteria
- รักษา modular monolith boundaries; ห้ามย้าย business rule ไป controller หรือ UI

ก่อนแก้ไฟล์ ให้บอกผู้ใช้สั้น ๆ ว่าจะเปลี่ยนส่วนใดและตรวจอย่างไร

## 3. Use TDD

สำหรับ business behavior:

1. เขียน test ที่อธิบาย expected behavior
2. รัน test และยืนยันว่า fail ด้วยเหตุผลที่คาดไว้
3. เขียน implementation ขั้นต่ำให้ test ผ่าน
4. รัน test เฉพาะส่วน
5. รัน regression suite ของ module
6. Refactor เมื่อ tests ยังผ่าน

ใช้ unit test กับ pure rules และใช้ PostgreSQL integration test กับ transaction, lock, Prisma query และ migration ห้ามใช้ mock เพื่อพิสูจน์ concurrency หรือ database constraint

## 4. Protect Stock Transactions

ก่อนแก้ stock-in, adjustment, sale หรือ cancellation ให้ตรวจ checklist:

- Mutation มี `Idempotency-Key` หรือไม่
- Validation เกิดก่อนเริ่ม transaction เท่าที่ทำได้หรือไม่
- Read และ write ที่ต้อง atomic อยู่ใน PostgreSQL transaction เดียวหรือไม่
- FIFO candidate rows ถูก lock ก่อน allocation หรือไม่
- Ordering เป็น `receivedAt`, `createdAt`, `id` แบบ ascending หรือไม่
- Lot ที่หมดอายุหรือ available quantity เป็นศูนย์ถูกตัดออกหรือไม่
- `SaleAllocation` snapshot quantity และ unit cost หรือไม่
- Stock ไม่สามารถต่ำกว่า 0 จาก constraint และ transaction logic หรือไม่
- Failure ใด ๆ rollback ทั้ง operation หรือไม่
- Retry request คืนผลเดิมและไม่สร้าง movement ซ้ำหรือไม่
- Cancellation/adjustment สร้าง reversing movement แทนการแก้ ledger หรือไม่
- Actor, reason, reference และ request ID ถูก audit หรือไม่

ห้าม update/delete `InventoryMovement` ที่ committed แล้ว และห้าม hard-delete record ที่มี transaction history

## 5. Enforce Security

- ตรวจ authorization ใน API guard/policy ทุก endpoint
- ทดสอบ allow และ deny cases ของ role ที่เกี่ยวข้อง
- UI ซ่อนหรือ disable action ตาม permission แต่ไม่ใช้ UI เป็น security boundary
- ห้าม log password, token, cookie, secret หรือ full sensitive payload
- Backup, restore, user-role change, cancellation และ adjustment ต้องมี audit record

## 6. Work Through Docker

ใช้ commands ที่ project กำหนดใน `AGENTS.md` เป็นหลัก:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose exec api pnpm prisma:migrate:deploy
docker compose exec api pnpm lint
docker compose exec api pnpm typecheck
docker compose exec api pnpm test
docker compose exec api pnpm test:integration
docker compose exec web pnpm lint
docker compose exec web pnpm typecheck
docker compose exec web pnpm test
docker compose run --rm api pnpm test:smoke
```

ใช้ `docker compose logs` และ health endpoints ตรวจ startup failures ห้ามใช้ `down -v`, ลบ volume, restore database หรือ destructive migration โดยไม่ได้รับอนุมัติชัดเจน

## 7. Verify The Changed Surface

เลือก verification ตามงาน:

- Domain rule: unit tests และ module regression
- Prisma/schema: migration บน empty database และ fixture database
- Transaction/FIFO: PostgreSQL integration และ parallel concurrency test
- API: contract, RBAC และ idempotency tests
- UI: component tests และ Playwright critical path ตาม role
- Export: compare totals กับ report query source
- Backup: artifact verification และ isolated restore drill
- Docker/infra: `docker compose config`, build, healthcheck และ smoke test

ก่อนสรุปผล ให้อ่าน acceptance criteria ของ task ซ้ำและรายงาน commands ที่รันจริงพร้อมผลลัพธ์

## Stop Conditions

หยุดและถามผู้ใช้เมื่อพบกรณีต่อไปนี้:

- Requirement ขัดกับ inventory invariant หรือ audit policy
- Existing schema/migration ขัดกับ `plan.md` และไม่มีหลักฐานว่าฝั่งใดใหม่กว่า
- การแก้ต้องทำลายหรือ rewrite production data
- ต้องลบ volume, restore database หรือ rotate production secrets
- Permission matrix ไม่ครอบคลุม action ใหม่
- Accounting definition เปลี่ยนจาก gross profit หรือเพิ่ม VAT, credit sale, receivable, partial return
- Scope ต้องเพิ่ม multi-warehouse, barcode, purchase order หรือ expense accounting

เมื่อไม่มี blocker ให้ใช้ assumption ที่บันทึกใน `plan.md` โดยไม่ขยาย scope
