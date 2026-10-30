import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const [accounts, leads, campaigns, sent, notes] = await Promise.all([
    p.emailAccount.count(),
    p.lead.count(),
    p.campaign.count(),
    p.sentEmail.count(),
    p.note.count(),
  ]);
  console.log(
    JSON.stringify({ accounts, leads, campaigns, sent, notes }, null, 2)
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
