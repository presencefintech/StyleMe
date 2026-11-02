-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'EDIT';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "prompt" TEXT;

