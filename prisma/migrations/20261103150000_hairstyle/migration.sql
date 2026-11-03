-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'HAIRSTYLE';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "hairstyleId" TEXT;
