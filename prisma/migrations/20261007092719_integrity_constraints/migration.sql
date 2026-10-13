-- Integrity constraints that cannot be expressed in the Prisma schema language.

-- Billing period sanity
ALTER TABLE "ParkingFee"
  ADD CONSTRAINT "ParkingFee_month_range" CHECK ("month" BETWEEN 1 AND 12),
  ADD CONSTRAINT "ParkingFee_year_range" CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "ParkingFee_amounts_non_negative" CHECK ("baseAmount" >= 0 AND "lateFee" >= 0 AND "amount" >= 0),
  ADD CONSTRAINT "ParkingFee_amount_total" CHECK ("amount" = "baseAmount" + "lateFee");

-- Payments must always be for a positive amount
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0);

-- A parking fee can be settled by at most one successful payment
CREATE UNIQUE INDEX "Payment_one_success_per_fee"
  ON "Payment" ("parkingFeeId")
  WHERE "status" = 'SUCCESS';

-- Settings sanity
ALTER TABLE "ParkingSetting"
  ADD CONSTRAINT "ParkingSetting_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "ParkingSetting_due_day_range" CHECK ("dueDay" BETWEEN 1 AND 28),
  ADD CONSTRAINT "ParkingSetting_amounts_non_negative" CHECK ("defaultMonthlyFee" >= 0 AND "lateFee" >= 0);

ALTER TABLE "FeeRule"
  ADD CONSTRAINT "FeeRule_amount_non_negative" CHECK ("amount" >= 0);
