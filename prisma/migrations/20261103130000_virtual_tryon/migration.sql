-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'TRYON';

-- CreateEnum
CREATE TYPE "GarmentCategory" AS ENUM ('UPPER_BODY', 'LOWER_BODY', 'DRESSES');

-- CreateTable
CREATE TABLE "Garment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "GarmentCategory" NOT NULL,
    "description" TEXT,
    "bucket" TEXT NOT NULL DEFAULT 'garments',
    "key" TEXT NOT NULL,
    "author" TEXT,
    "license" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Garment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "garmentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Garment_bucket_key_key" ON "Garment"("bucket", "key");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_garmentId_fkey" FOREIGN KEY ("garmentId") REFERENCES "Garment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
