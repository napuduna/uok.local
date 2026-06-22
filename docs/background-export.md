# Background Export

Task 4.2 ใช้ BullMQ queue `report-exports` ผ่าน Redis โดย API บันทึก
`ExportJob` และ report snapshot ก่อน enqueue งาน จากนั้น worker สร้าง Excel หรือ
PDF จาก snapshot เดียวกัน

Endpoints:

- `POST /api/v1/exports` ต้องมี `Idempotency-Key`
- `GET /api/v1/exports/:id`
- `GET /api/v1/exports/:id/download`

Artifact อยู่ใน Docker named volume `export_artifacts` ที่
`/var/lib/uok/exports` มี SHA-256 checksum และหมดอายุหลัง 24 ชั่วโมง
scheduled cleanup ทำงานทุกชั่วโมง การอ่านสถานะและดาวน์โหลดจำกัดเฉพาะ requester
หรือ role ที่มีสิทธิ์ export ทั้งหมด

Environment:

```text
EXPORT_ARTIFACT_DIR=/var/lib/uok/exports
EXPORT_THAI_FONT_PATH=/workspace/apps/worker/node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff2
```
