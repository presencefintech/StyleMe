-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'LOOK';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "makeupId" TEXT,
ADD COLUMN "accessoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "makeupId" TEXT,
ADD COLUMN "accessoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "occasionId" TEXT;
