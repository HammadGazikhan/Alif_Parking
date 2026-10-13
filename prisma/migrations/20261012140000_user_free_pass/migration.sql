-- Free pass holders are listed on the Clover Hills sheet and are not billed.
ALTER TABLE "User" ADD COLUMN "freePass" BOOLEAN NOT NULL DEFAULT false;
