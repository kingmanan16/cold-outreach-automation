/**
 * Dry-run / status check for Gmail API readiness.
 * Usage: npx tsx --env-file=.env scripts/verify-gmail-api.ts
 */
import { PrismaClient } from "@prisma/client";
import { isGoogleOAuthAccount } from "../lib/gmail-oauth";

const prisma = new PrismaClient();

async function main() {
  const oauthEnv = {
    clientId: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    clientSecret: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    redirect: Boolean(
      process.env.GOOGLE_OAUTH_REDIRECT_URI || process.env.APP_URL
    ),
  };

  console.log("=== Gmail API readiness ===");
  console.log("OAuth env:", oauthEnv);

  const accounts = await prisma.emailAccount.findMany({
    where: { disabled: false },
    orderBy: { email: "asc" },
  });

  if (accounts.length === 0) {
    console.log("No email accounts in DB.");
    return;
  }

  let ready = 0;
  for (const a of accounts) {
    const ok = isGoogleOAuthAccount(a);
    if (ok) ready += 1;
    console.log(
      `- ${a.email}: ${ok ? "READY (gmail-api)" : "NOT READY (smtp-only)"} oauthProvider=${a.oauthProvider ?? "null"} refresh=${Boolean(a.oauthRefreshEnc)} access=${Boolean(a.oauthAccessEnc)}`
    );
  }

  console.log(`\nReady mailboxes: ${ready}/${accounts.length}`);
  if (!oauthEnv.clientId || !oauthEnv.clientSecret) {
    console.log(
      "\nACTION: Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET (+ REDIRECT_URI) in .env, Vercel, and Railway."
    );
  }
  if (ready === 0) {
    console.log(
      "ACTION: Open production Accounts → Connect Google OAuth once per sending mailbox (consent screen)."
    );
  } else {
    console.log(
      "OK: At least one mailbox can send via Gmail API after deploy."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
