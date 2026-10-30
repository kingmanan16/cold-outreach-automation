-- Pacing columns landed in schema.prisma without a migration; add them here.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sendGapSec" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "maxPerTick" INTEGER NOT NULL DEFAULT 5;

-- Follow-ups reply inside Mail 1's thread, from Mail 1's mailbox.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "threadFollowUps" BOOLEAN NOT NULL DEFAULT true;

-- Backs the duplicate-step guard and the thread lookup in the sender.
CREATE INDEX IF NOT EXISTS "SentEmail_campaignId_leadId_stepOrder_idx"
  ON "SentEmail"("campaignId", "leadId", "stepOrder");

-- Columns that only ever reached the database through `prisma db push`,
-- so a database built from migrations alone was missing them.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "dailyCap" INTEGER NOT NULL DEFAULT 45;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "pausedByKillSwitch" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemSettings" ALTER COLUMN "id" SET DEFAULT 'default';
ALTER TABLE "SystemSettings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Foreign keys from the same gap. Postgres has no ADD CONSTRAINT IF NOT
-- EXISTS, so each one is guarded individually and stays re-runnable.
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LeadList" ADD CONSTRAINT "LeadList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CampaignAccount" ADD CONSTRAINT "CampaignAccount_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CampaignAccount" ADD CONSTRAINT "CampaignAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WarmupMessage" ADD CONSTRAINT "WarmupMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
