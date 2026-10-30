/**
 * Wipe outreach data for a fresh lead upload.
 * Keeps: EmailAccount credentials, SystemSettings, Users, Workspaces, Webhooks.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const counts = {
    notes: await prisma.note.deleteMany({}),
    leadEvents: await prisma.leadEvent.deleteMany({}),
    replies: await prisma.reply.deleteMany({}),
    sentEmails: await prisma.sentEmail.deleteMany({}),
    campaignLeads: await prisma.campaignLead.deleteMany({}),
    campaignAccounts: await prisma.campaignAccount.deleteMany({}),
    campaignSteps: await prisma.campaignStep.deleteMany({}),
    campaigns: await prisma.campaign.deleteMany({}),
    leads: await prisma.lead.deleteMany({}),
    leadLists: await prisma.leadList.deleteMany({}),
    suppressions: await prisma.suppression.deleteMany({}),
    warmupMessages: await prisma.warmupMessage.deleteMany({}),
    placementTests: await prisma.placementTest.deleteMany({}),
  };

  await prisma.emailAccount.updateMany({
    data: { sentToday: 0 },
  });

  console.log("Cleared outreach data:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k}: ${v.count}`);
  }
  console.log("Kept: email accounts, settings, team users.");
  console.log("Account sentToday counters reset to 0.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
