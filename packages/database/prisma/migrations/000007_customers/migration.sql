CREATE TYPE "CustomerGender" AS ENUM (
    'MALE',
    'FEMALE',
    'OTHER',
    'UNSPECIFIED'
);

CREATE TABLE "Customer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "CustomerGender" NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Customer_age_check" CHECK ("age" >= 0 AND "age" <= 150)
);

CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");
CREATE INDEX "Customer_isActive_code_id_idx"
    ON "Customer"("isActive", "code", "id");
CREATE INDEX "Customer_firstName_lastName_idx"
    ON "Customer"("firstName", "lastName");
CREATE INDEX "Customer_phoneNormalized_idx"
    ON "Customer"("phoneNormalized");
