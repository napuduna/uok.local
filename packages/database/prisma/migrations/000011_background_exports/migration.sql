CREATE TYPE "ExportFormat" AS ENUM ('XLSX', 'PDF');

CREATE TYPE "ExportReportType" AS ENUM (
  'SALES',
  'GROSS_PROFIT',
  'INVENTORY_CURRENT',
  'INVENTORY_LOW_STOCK',
  'INVENTORY_EXPIRY',
  'TOP_CUSTOMERS',
  'NEW_CUSTOMERS'
);

CREATE TYPE "ExportJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'EXPIRED'
);

CREATE TABLE "ExportJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reportType" "ExportReportType" NOT NULL,
  "format" "ExportFormat" NOT NULL,
  "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" UUID NOT NULL,
  "requestedRole" "UserRole" NOT NULL,
  "filters" JSONB NOT NULL,
  "resultSnapshot" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "requestId" TEXT,
  "fileName" TEXT,
  "contentType" TEXT,
  "artifactPath" TEXT,
  "fileChecksum" TEXT,
  "fileSizeBytes" INTEGER,
  "safeErrorCode" TEXT,
  "safeErrorMessage" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExportJob_idempotencyKey_key"
ON "ExportJob"("idempotencyKey");

CREATE INDEX "ExportJob_requestedById_createdAt_id_idx"
ON "ExportJob"("requestedById", "createdAt", "id");

CREATE INDEX "ExportJob_status_expiresAt_id_idx"
ON "ExportJob"("status", "expiresAt", "id");

ALTER TABLE "ExportJob"
ADD CONSTRAINT "ExportJob_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
