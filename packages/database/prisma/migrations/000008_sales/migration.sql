CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELLED');

CREATE SEQUENCE "sale_invoice_seq" START 1;

CREATE TABLE "Sale" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceNumber" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "soldAt" TIMESTAMP(3) NOT NULL,
    "totalSales" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "grossProfit" DECIMAL(14,2) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "requestId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelledById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Sale_totalSales_check" CHECK ("totalSales" >= 0),
    CONSTRAINT "Sale_totalCost_check" CHECK ("totalCost" >= 0),
    CONSTRAINT "Sale_grossProfit_check" CHECK (
        "grossProfit" = "totalSales" - "totalCost"
    ),
    CONSTRAINT "Sale_cancellation_check" CHECK (
        ("status" = 'COMPLETED'
            AND "cancelledAt" IS NULL
            AND "cancellationReason" IS NULL
            AND "cancelledById" IS NULL)
        OR
        ("status" = 'CANCELLED'
            AND "cancelledAt" IS NOT NULL
            AND char_length(btrim("cancellationReason")) >= 3
            AND "cancelledById" IS NOT NULL)
    )
);

CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "salesSubtotal" DECIMAL(14,2) NOT NULL,
    "costSubtotal" DECIMAL(14,2) NOT NULL,
    "grossProfit" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SaleItem_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "SaleItem_unitPrice_check" CHECK ("unitPrice" > 0),
    CONSTRAINT "SaleItem_salesSubtotal_check" CHECK (
        "salesSubtotal" = "unitPrice" * "quantity"
    ),
    CONSTRAINT "SaleItem_costSubtotal_check" CHECK ("costSubtotal" >= 0),
    CONSTRAINT "SaleItem_grossProfit_check" CHECK (
        "grossProfit" = "salesSubtotal" - "costSubtotal"
    )
);

CREATE TABLE "SaleAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "saleItemId" UUID NOT NULL,
    "lotId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "costSubtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "SaleAllocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SaleAllocation_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "SaleAllocation_unitCost_check" CHECK ("unitCost" > 0),
    CONSTRAINT "SaleAllocation_costSubtotal_check" CHECK (
        "costSubtotal" = "unitCost" * "quantity"
    )
);

CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");
CREATE INDEX "Sale_soldAt_id_idx" ON "Sale"("soldAt", "id");
CREATE INDEX "Sale_customerId_soldAt_id_idx"
    ON "Sale"("customerId", "soldAt", "id");
CREATE INDEX "Sale_createdById_soldAt_id_idx"
    ON "Sale"("createdById", "soldAt", "id");
CREATE INDEX "Sale_warehouseId_soldAt_id_idx"
    ON "Sale"("warehouseId", "soldAt", "id");
CREATE INDEX "Sale_status_soldAt_id_idx"
    ON "Sale"("status", "soldAt", "id");
CREATE UNIQUE INDEX "SaleItem_saleId_productId_key"
    ON "SaleItem"("saleId", "productId");
CREATE INDEX "SaleItem_productId_saleId_idx"
    ON "SaleItem"("productId", "saleId");
CREATE UNIQUE INDEX "SaleAllocation_saleItemId_lotId_key"
    ON "SaleAllocation"("saleItemId", "lotId");
CREATE INDEX "SaleAllocation_lotId_saleItemId_idx"
    ON "SaleAllocation"("lotId", "saleItemId");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleAllocation" ADD CONSTRAINT "SaleAllocation_saleItemId_fkey"
    FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleAllocation" ADD CONSTRAINT "SaleAllocation_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "Lot"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
