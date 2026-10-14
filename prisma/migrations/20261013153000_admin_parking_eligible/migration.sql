-- Administrators pay parking fees unless they are on a free pass.
UPDATE "User"
SET "parkingEligible" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE role = 'ADMIN' AND "freePass" = false AND "parkingEligible" = false;
