CREATE TYPE "InventoryMovementType" AS ENUM (
    'STOCK_IN',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'SALE',
    'SALE_CANCELLATION'
);

CREATE TABLE "Lot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "unitCost" DECIMAL(12,2) NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "availableQuantity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Lot_unitCost_check" CHECK ("unitCost" > 0),
    CONSTRAINT "Lot_receivedQuantity_check" CHECK ("receivedQuantity" > 0),
    CONSTRAINT "Lot_availableQuantity_check" CHECK ("availableQuantity" >= 0),
    CONSTRAINT "Lot_expiryDate_check" CHECK (
        "expiryDate" IS NULL OR "expiryDate" >= "receivedAt"
    )
);

CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "InventoryMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "lotId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "requestId" TEXT,
    "reason" TEXT,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryMovement_quantityDelta_check" CHECK ("quantityDelta" <> 0)
);

CREATE UNIQUE INDEX "Lot_productId_warehouseId_lotNumber_key"
    ON "Lot"("productId", "warehouseId", "lotNumber");
CREATE INDEX "Lot_productId_warehouseId_isActive_idx"
    ON "Lot"("productId", "warehouseId", "isActive");
CREATE INDEX "Lot_warehouseId_expiryDate_idx"
    ON "Lot"("warehouseId", "expiryDate");
CREATE INDEX "Lot_productId_warehouseId_receivedAt_createdAt_id_idx"
    ON "Lot"("productId", "warehouseId", "receivedAt", "createdAt", "id");
CREATE INDEX "InventoryMovement_lotId_occurredAt_id_idx"
    ON "InventoryMovement"("lotId", "occurredAt", "id");
CREATE INDEX "InventoryMovement_warehouseId_occurredAt_idx"
    ON "InventoryMovement"("warehouseId", "occurredAt");
CREATE INDEX "InventoryMovement_referenceType_referenceId_idx"
    ON "InventoryMovement"("referenceType", "referenceId");
CREATE INDEX "InventoryMovement_actorId_occurredAt_idx"
    ON "InventoryMovement"("actorId", "occurredAt");

ALTER TABLE "Lot" ADD CONSTRAINT "Lot_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "Lot"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION enforce_inventory_movement_warehouse()
RETURNS TRIGGER AS $$
DECLARE
    lot_warehouse_id UUID;
BEGIN
    SELECT "warehouseId" INTO lot_warehouse_id
    FROM "Lot"
    WHERE "id" = NEW."lotId";

    IF lot_warehouse_id IS DISTINCT FROM NEW."warehouseId" THEN
        RAISE EXCEPTION 'inventory movement warehouse must match lot warehouse';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryMovement_warehouse_guard"
BEFORE INSERT ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION enforce_inventory_movement_warehouse();

CREATE FUNCTION reject_inventory_movement_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'inventory movements are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryMovement_append_only"
BEFORE UPDATE OR DELETE ON "InventoryMovement"
FOR EACH ROW EXECUTE FUNCTION reject_inventory_movement_mutation();
