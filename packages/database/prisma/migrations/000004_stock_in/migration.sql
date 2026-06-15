CREATE TABLE "StockIn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "referenceNumber" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockIn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockInItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stockInId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "StockInItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockInItem_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "StockInItem_unitCost_check" CHECK ("unitCost" > 0)
);

CREATE UNIQUE INDEX "StockIn_referenceNumber_key" ON "StockIn"("referenceNumber");
CREATE UNIQUE INDEX "StockIn_idempotencyKey_key" ON "StockIn"("idempotencyKey");
CREATE INDEX "StockIn_warehouseId_receivedAt_id_idx"
    ON "StockIn"("warehouseId", "receivedAt", "id");
CREATE INDEX "StockIn_createdById_createdAt_idx"
    ON "StockIn"("createdById", "createdAt");
CREATE UNIQUE INDEX "StockInItem_lotId_key" ON "StockInItem"("lotId");
CREATE INDEX "StockInItem_stockInId_id_idx" ON "StockInItem"("stockInId", "id");
CREATE INDEX "StockInItem_productId_stockInId_idx"
    ON "StockInItem"("productId", "stockInId");

ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockIn" ADD CONSTRAINT "StockIn_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_stockInId_fkey"
    FOREIGN KEY ("stockInId") REFERENCES "StockIn"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockInItem" ADD CONSTRAINT "StockInItem_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "Lot"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
