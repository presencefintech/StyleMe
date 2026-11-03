-- AlterTable
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT, ADD COLUMN "referredById" TEXT;

-- Backfill des comptes existants : code déterministe dérivé de l'id
UPDATE "User" SET "referralCode" = upper(substr(md5("id"), 1, 8)) WHERE "referralCode" IS NULL;

ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
