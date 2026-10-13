-- AlterTable
ALTER TABLE "FeeRule" DROP COLUMN "parkingArea";

-- AlterTable
ALTER TABLE "Vehicle" DROP COLUMN "color",
DROP COLUMN "make",
DROP COLUMN "model",
DROP COLUMN "parkingArea",
DROP COLUMN "parkingSlot";
