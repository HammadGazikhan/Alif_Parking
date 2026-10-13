-- Fee rules now match on vehicle type only; category-only rules can no longer apply.
DELETE FROM "FeeRule" WHERE "vehicleType" IS NULL;

-- Sign-in matches the Microsoft Entra ID email case-insensitively.
UPDATE "User" SET "email" = LOWER("email");

-- DropIndex
DROP INDEX "User_department_idx";

-- DropIndex
DROP INDEX "User_employeeCode_key";

-- AlterTable
ALTER TABLE "FeeRule" DROP COLUMN "employeeCategory",
ALTER COLUMN "vehicleType" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "department",
DROP COLUMN "designation",
DROP COLUMN "employeeCategory",
DROP COLUMN "employeeCode",
DROP COLUMN "passwordHash";
