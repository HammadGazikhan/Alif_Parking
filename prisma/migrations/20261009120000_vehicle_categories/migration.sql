-- Vehicle categories replace the vehicle-type enum and priority fee rules.
-- Existing parking fees, payments, and audit rows are left in place.

ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_ACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_DEACTIVATED';

CREATE TABLE "VehicleCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "monthlyFee" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VehicleCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehicleCategory_nameKey_key" ON "VehicleCategory"("nameKey");
CREATE INDEX "VehicleCategory_active_idx" ON "VehicleCategory"("active");

-- Price for each default category: highest-priority active fee rule, else the global default.
INSERT INTO "VehicleCategory" ("id", "name", "nameKey", "monthlyFee", "active", "createdAt", "updatedAt")
SELECT
    'cat_' || lower(t.label),
    t.label,
    lower(t.label),
    COALESCE(
        (
            SELECT fr.amount
            FROM "FeeRule" fr
            WHERE fr."vehicleType"::text = t.type AND fr.active = true
            ORDER BY fr.priority DESC, fr."createdAt" ASC
            LIMIT 1
        ),
        (SELECT "defaultMonthlyFee" FROM "ParkingSetting" WHERE id = 1),
        50000
    ),
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    VALUES
        ('CAR', 'Car'),
        ('BIKE', 'Bike'),
        ('SCOOTER', 'Scooter'),
        ('OTHER', 'Other')
) AS t(type, label);

ALTER TABLE "Vehicle" ADD COLUMN "categoryId" TEXT;

UPDATE "Vehicle" AS v
SET "categoryId" = c.id
FROM "VehicleCategory" AS c
WHERE c."nameKey" = lower(
    CASE v.type::text
        WHEN 'CAR' THEN 'Car'
        WHEN 'BIKE' THEN 'Bike'
        WHEN 'SCOOTER' THEN 'Scooter'
        ELSE 'Other'
    END
);

ALTER TABLE "Vehicle" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "Vehicle"
ADD CONSTRAINT "Vehicle_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "VehicleCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Vehicle_categoryId_idx" ON "Vehicle"("categoryId");

ALTER TABLE "Vehicle" DROP COLUMN "type";

DROP TABLE "FeeRule";
DROP TYPE "VehicleType";

ALTER TABLE "ParkingSetting" DROP COLUMN "defaultMonthlyFee";

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "ParkingFee"
        GROUP BY "vehicleId", "month", "year"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot enforce one bill per vehicle per month: duplicate ParkingFee rows exist';
    END IF;
END $$;

DROP INDEX "ParkingFee_userId_vehicleId_month_year_key";

CREATE UNIQUE INDEX "unique_fee_per_vehicle_month" ON "ParkingFee"("vehicleId", "month", "year");
