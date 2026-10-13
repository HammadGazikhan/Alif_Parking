-- Profile photo copied from Microsoft when an employee is added. Existing users stay without one.
ALTER TABLE "User" ADD COLUMN "avatar" BYTEA,
ADD COLUMN "avatarType" TEXT;
