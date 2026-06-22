CREATE TYPE "ExportReportType" AS ENUM (
    'SALES',
    'GROSS_PROFIT',
    'INVENTORY_CURRENT',
    'INVENTORY_LOW_STOCK',
    'INVENTORY_EXPIRY',
    'CUSTOMERS_TOP',
    'CUSTOMERS_NEW'
);

CREATE TYPE "ExportFormat" AS ENUM ('XLSX', 'PDF');

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
    "requesterId" UUID NOT NULL,
    "filters" JSONB NOT NULL,
    "scope" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "queueJobId" TEXT NOT NULL,
    "artifactPath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "checksum" TEXT,
    "sizeBytes" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ExportJob_requesterId_fkey"
        FOREIGN KEY ("requesterId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExportJob_size_check"
        CHECK ("sizeBytes" IS NULL OR "sizeBytes" >= 0),
    CONSTRAINT "ExportJob_checksum_check"
        CHECK ("checksum" IS NULL OR "checksum" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "ExportJob_status_fields_check" CHECK (
        ("status" IN ('PENDING', 'PROCESSING')
            AND "artifactPath" IS NULL
            AND "checksum" IS NULL
            AND "completedAt" IS NULL)
        OR
        ("status" = 'COMPLETED'
            AND "artifactPath" IS NOT NULL
            AND "fileName" IS NOT NULL
            AND "mimeType" IS NOT NULL
            AND "checksum" IS NOT NULL
            AND "sizeBytes" IS NOT NULL
            AND "expiresAt" IS NOT NULL
            AND "completedAt" IS NOT NULL)
        OR
        ("status" = 'FAILED'
            AND "errorCode" IS NOT NULL
            AND "errorMessage" IS NOT NULL
            AND "failedAt" IS NOT NULL)
        OR
        ("status" = 'EXPIRED'
            AND "artifactPath" IS NULL)
    )
);

CREATE UNIQUE INDEX "ExportJob_idempotencyKey_key"
    ON "ExportJob"("idempotencyKey");
CREATE UNIQUE INDEX "ExportJob_queueJobId_key"
    ON "ExportJob"("queueJobId");
CREATE INDEX "ExportJob_requesterId_createdAt_id_idx"
    ON "ExportJob"("requesterId", "createdAt", "id");
CREATE INDEX "ExportJob_status_createdAt_id_idx"
    ON "ExportJob"("status", "createdAt", "id");
CREATE INDEX "ExportJob_expiresAt_id_idx"
    ON "ExportJob"("expiresAt", "id");
