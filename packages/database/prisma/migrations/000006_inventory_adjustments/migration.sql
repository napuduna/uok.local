CREATE TYPE "InventoryAdjustmentDirection" AS ENUM (
    'INCREASE',
    'DECREASE'
);

CREATE TABLE "InventoryAdjustment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "referenceNumber" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "direction" "InventoryAdjustmentDirection" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeQuantity" INTEGER NOT NULL,
    "afterQuantity" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryAdjustment_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "InventoryAdjustment_quantityDelta_check" CHECK (
        ("direction" = 'INCREASE' AND "quantityDelta" = "quantity")
        OR
        ("direction" = 'DECREASE' AND "quantityDelta" = -"quantity")
    ),
    CONSTRAINT "InventoryAdjustment_reason_check" CHECK (
        char_length(btrim("reason")) >= 3
    ),
    CONSTRAINT "InventoryAdjustment_beforeQuantity_check" CHECK (
        "beforeQuantity" >= 0
    ),
    CONSTRAINT "InventoryAdjustment_afterQuantity_check" CHECK (
        "afterQuantity" >= 0
        AND "afterQuantity" = "beforeQuantity" + "quantityDelta"
    )
);

CREATE UNIQUE INDEX "InventoryAdjustment_referenceNumber_key"
    ON "InventoryAdjustment"("referenceNumber");
CREATE UNIQUE INDEX "InventoryAdjustment_idempotencyKey_key"
    ON "InventoryAdjustment"("idempotencyKey");
CREATE INDEX "InventoryAdjustment_warehouseId_createdAt_id_idx"
    ON "InventoryAdjustment"("warehouseId", "createdAt", "id");
CREATE INDEX "InventoryAdjustment_lotId_createdAt_id_idx"
    ON "InventoryAdjustment"("lotId", "createdAt", "id");
CREATE INDEX "InventoryAdjustment_createdById_createdAt_idx"
    ON "InventoryAdjustment"("createdById", "createdAt");

ALTER TABLE "InventoryAdjustment"
    ADD CONSTRAINT "InventoryAdjustment_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment"
    ADD CONSTRAINT "InventoryAdjustment_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "Lot"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustment"
    ADD CONSTRAINT "InventoryAdjustment_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
