-- 2-wheelers (Bike, Scooter) ₹150, 4-wheelers (Car) ₹300.
-- Correct unpaid November 2026 bills and create the missing October 2026 bills.
-- Amounts are paise. October stays DUE with no late fee and no notifications.

UPDATE "VehicleCategory"
SET "monthlyFee" = 15000, "updatedAt" = CURRENT_TIMESTAMP
WHERE "nameKey" IN ('bike', 'scooter');

UPDATE "VehicleCategory"
SET "monthlyFee" = 30000, "updatedAt" = CURRENT_TIMESTAMP
WHERE "nameKey" = 'car';

UPDATE "ParkingFee" AS f
SET
  "baseAmount" = c."monthlyFee",
  "amount" = c."monthlyFee" + f."lateFee",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Vehicle" AS v
JOIN "VehicleCategory" AS c ON c.id = v."categoryId"
WHERE f."vehicleId" = v.id
  AND f.year = 2026
  AND f.month = 11
  AND f.status = 'DUE'
  AND c."nameKey" IN ('bike', 'scooter', 'car');

INSERT INTO "ParkingFee" (
  "id",
  "userId",
  "vehicleId",
  "month",
  "year",
  "baseAmount",
  "lateFee",
  "amount",
  "status",
  "dueDate",
  "createdAt",
  "updatedAt"
)
SELECT
  'fee_202610_' || v.id,
  v."userId",
  v.id,
  10,
  2026,
  c."monthlyFee",
  0,
  c."monthlyFee",
  'DUE',
  TIMESTAMPTZ '2026-10-10 23:59:59+05:30',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Vehicle" AS v
JOIN "VehicleCategory" AS c ON c.id = v."categoryId"
JOIN "User" AS u ON u.id = v."userId"
WHERE v.status = 'ACTIVE'
  AND c.active = true
  AND c."nameKey" IN ('bike', 'scooter', 'car')
  AND u.role = 'EMPLOYEE'
  AND u.status = 'ACTIVE'
  AND u."parkingEligible" = true
  AND u."freePass" = false
  AND NOT EXISTS (
    SELECT 1
    FROM "ParkingFee" AS existing
    WHERE existing."vehicleId" = v.id
      AND existing.month = 10
      AND existing.year = 2026
  );
