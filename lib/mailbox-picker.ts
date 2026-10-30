import type { EmailAccount, PrismaClient } from "@prisma/client";
import { isGoogleOAuthAccount } from "@/lib/gmail-oauth";

export type AccountPick =
  | { ok: true; account: EmailAccount; sticky: boolean }
  | { ok: false; reason: "NO_CAPACITY" }
  | { ok: false; reason: "ORIGINAL_MAILBOX_BUSY"; accountEmail: string };

/**
 * Sending mailboxes this campaign may use, best-first.
 * Pinned mailboxes win when the campaign has any; otherwise every enabled one.
 * Railway can only reach Gmail over HTTPS, so OAuth accounts sort ahead there.
 */
export async function eligibleAccounts(
  prisma: PrismaClient,
  campaignId?: string
): Promise<EmailAccount[]> {
  const onRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
  );

  let pool: EmailAccount[] = [];
  if (campaignId) {
    const pinned = await prisma.campaignAccount.findMany({
      where: { campaignId },
      include: { account: true },
    });
    // A pinned list is a hard restriction: never widen it just because every
    // pinned mailbox happens to be full or disabled right now.
    if (pinned.length > 0) pool = pinned.map((p) => p.account);
    else pool = await prisma.emailAccount.findMany({ where: { disabled: false } });
  } else {
    pool = await prisma.emailAccount.findMany({ where: { disabled: false } });
  }

  return pool
    .filter((a) => !a.disabled && a.sentToday < a.dailyLimit)
    .sort((a, b) => {
      if (onRailway) {
        const ao = isGoogleOAuthAccount(a) ? 0 : 1;
        const bo = isGoogleOAuthAccount(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
      }
      if (a.sentToday !== b.sentToday) return a.sentToday - b.sentToday;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

/**
 * Pick the mailbox for one send.
 *
 * A lead that already got Mail 1 must keep hearing from that same address —
 * a follow-up arriving from a different mailbox reads as spam to the prospect
 * and breaks the thread. So the original sender wins, and if it is merely out
 * of room for today we wait for it rather than switching senders.
 */
export async function pickAccount(
  prisma: PrismaClient,
  campaignId: string,
  leadId?: string
): Promise<AccountPick> {
  const eligible = await eligibleAccounts(prisma, campaignId);

  if (leadId) {
    const first = await prisma.sentEmail.findFirst({
      where: { campaignId, leadId, isManualReply: false },
      orderBy: { sentAt: "asc" },
      select: { accountId: true },
    });

    if (first) {
      const sticky = eligible.find((a) => a.id === first.accountId);
      if (sticky) return { ok: true, account: sticky, sticky: true };

      const original = await prisma.emailAccount.findUnique({
        where: { id: first.accountId },
      });
      // Still ours, just out of room today — hold the lead for it.
      if (original && !original.disabled) {
        return {
          ok: false,
          reason: "ORIGINAL_MAILBOX_BUSY",
          accountEmail: original.email,
        };
      }
      // Disabled or deleted for good: nothing to wait for, so move on loudly.
      console.warn(
        `[sender] original mailbox for lead=${leadId} is gone — falling back, thread will break`
      );
    }
  }

  const next = eligible[0];
  if (!next) return { ok: false, reason: "NO_CAPACITY" };
  return { ok: true, account: next, sticky: false };
}
