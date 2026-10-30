-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "messageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Reply_messageId_key" ON "Reply"("messageId");
