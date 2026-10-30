-- AlterTable
ALTER TABLE "CampaignStep" ADD COLUMN IF NOT EXISTS "subjectB" TEXT;

-- AlterTable
ALTER TABLE "SentEmail" ADD COLUMN IF NOT EXISTS "subjectVariant" TEXT;
ALTER TABLE "SentEmail" ADD COLUMN IF NOT EXISTS "clicked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "reminderAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Note" ADD CONSTRAINT "Note_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
