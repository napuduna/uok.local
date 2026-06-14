# ระบบคลังสินค้า บริษัท ยู.โอเค จำกัด

TypeScript modular monolith สำหรับคลังสินค้า การขาย ลูกค้า ต้นทุน และรายงาน ใช้ Next.js, NestJS, PostgreSQL, Prisma, Redis และ Docker Compose

## เริ่มใช้งานด้วย Docker

1. คัดลอก `.env.example` เป็น `.env` และเปลี่ยน `SESSION_SECRET`, `POSTGRES_PASSWORD` และ `DEV_ADMIN_PASSWORD`
2. เริ่มระบบ:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f migrate api web worker
```

`migrate` ต้องจบด้วย exit code `0` ก่อน `api` และ `worker` เริ่มทำงาน จากนั้นเปิด `http://localhost`

สร้างข้อมูล development ครั้งแรก:

```bash
docker compose exec api pnpm prisma:seed
```

บัญชีเริ่มต้นคือ `admin@uok.local` และใช้รหัสผ่านจาก `DEV_ADMIN_PASSWORD`

## คำสั่งตรวจสอบ

```bash
docker compose config --quiet
docker compose build
docker compose run --rm api pnpm lint
docker compose run --rm api pnpm typecheck
docker compose run --rm api pnpm test
docker compose run --rm api pnpm test:integration
docker compose run --rm --no-deps --build e2e
```

นอก container ใช้ `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` และ `corepack pnpm build`

## Database และ migration

- Prisma schema อยู่ที่ `packages/database/prisma/schema.prisma`
- Migration เป็น forward-only และห้ามแก้ migration ที่ deploy แล้ว
- ใช้ `corepack pnpm prisma:migrate:deploy` สำหรับ environment ที่มีอยู่
- ใช้ `corepack pnpm prisma:migrate:verify` ตรวจทั้ง empty schema และ populated fixture
- Seed เป็น idempotent และมีเฉพาะ development/demo data
- ห้ามใช้ `docker compose down -v`, ลบ volume หรือ restore ฐานข้อมูลโดยไม่มี backup และ approval

## Production

กำหนด `SITE_ADDRESS` เป็น hostname จริงเพื่อให้ Caddy จัดการ TLS และต้องส่ง `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` และ `SESSION_SECRET` จาก server:

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

PostgreSQL และ Redis ไม่มี public port ทั้ง local Compose และ production override ข้อมูลอยู่ใน named volumes

## โครงสร้าง

```text
apps/web       Next.js UI
apps/api       NestJS API
apps/worker    background jobs
packages/      database, contracts, UI และ shared config
infra/         Caddy และ Docker runtime
```

อ่าน `AGENTS.md`, `plan.md` และ `.agents/skills/warehouse-system/SKILL.md` ก่อนเริ่มงานทุกครั้ง
