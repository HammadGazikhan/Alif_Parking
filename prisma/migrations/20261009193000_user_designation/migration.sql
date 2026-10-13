-- Job title from Microsoft. Existing accounts stay blank until an admin sets one.
ALTER TABLE "User" ADD COLUMN "designation" TEXT;
