ALTER TABLE "Sale"
    ADD COLUMN "cancellationIdempotencyKey" TEXT,
    ADD COLUMN "cancellationRequestHash" TEXT;

CREATE UNIQUE INDEX "Sale_cancellationIdempotencyKey_key"
    ON "Sale"("cancellationIdempotencyKey");

ALTER TABLE "Sale" DROP CONSTRAINT "Sale_cancellation_check";

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cancellation_check" CHECK (
    ("status" = 'COMPLETED'
        AND "cancelledAt" IS NULL
        AND "cancellationReason" IS NULL
        AND "cancellationIdempotencyKey" IS NULL
        AND "cancellationRequestHash" IS NULL
        AND "cancelledById" IS NULL)
    OR
    ("status" = 'CANCELLED'
        AND "cancelledAt" IS NOT NULL
        AND char_length(btrim("cancellationReason")) >= 3
        AND "cancellationIdempotencyKey" IS NOT NULL
        AND "cancellationRequestHash" IS NOT NULL
        AND "cancelledById" IS NOT NULL)
);
