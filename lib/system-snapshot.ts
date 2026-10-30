import {
  CampaignLeadStatus,
  CampaignStatus,
  PrismaClient,
} from "@prisma/client";
import { getSystemSettings } from "@/lib/notifications";
import { isGoogleOAuthAccount } from "@/lib/gmail-oauth";

export type SystemSnapshot = {
  at: string;
  globalPaused: boolean;
  campaigns: Array<{
    id: string;
    name: string;
    status: CampaignStatus;
    dailyCap: number;
    sentToday: number;
    remainingToday: number;
    dueTotal: number;
    dueFollowUps: number;
    dueNewMail: number;
    activeLeads: number;
    totalLeads: number;
    stepCount: number;
    threadFollowUps: boolean;
    sendGapSec: number;
    pinnedMailboxes: number;
  }>;
  mailboxes: Array<{
    email: string;
    disabled: boolean;
    sentToday: number;
    dailyLimit: number;
    remaining: number;
    gmailApiReady: boolean;
  }>;
  totals: {
    dueFollowUps: number;
    dueNewMail: number;
    mailboxCapacityRemaining: number;
  };
};

/**
 * Live read-only snapshot for the in-app assistant.
 * Never includes secrets (passwords, tokens).
 */
export async function buildSystemSnapshot(
  prisma: PrismaClient
): Promise<SystemSnapshot> {
  const settings = await getSystemSettings();
  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [campaigns, accounts] = await Promise.all([
    prisma.campaign.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { steps: true, campaignLeads: true } },
        campaignAccounts: true,
      },
    }),
    prisma.emailAccount.findMany({
      orderBy: { email: "asc" },
      select: {
        email: true,
        disabled: true,
        sentToday: true,
        dailyLimit: true,
        oauthProvider: true,
        oauthAccessEnc: true,
        oauthRefreshEnc: true,
      },
    }),
  ]);

  const campaignRows: SystemSnapshot["campaigns"] = [];
  let totalDueFollowUps = 0;
  let totalDueNewMail = 0;

  for (const c of campaigns) {
    const dailyCap = c.dailyCap ?? 45;
    const [sentToday, dueFollowUps, dueNewMail, activeLeads] = await Promise.all([
      prisma.sentEmail.count({
        where: {
          campaignId: c.id,
          sentAt: { gte: startOfToday },
          bounced: false,
          isManualReply: false,
        },
      }),
      prisma.campaignLead.count({
        where: {
          campaignId: c.id,
          status: CampaignLeadStatus.ACTIVE,
          currentStep: { gt: 0 },
          nextSendAt: { lte: now },
        },
      }),
      prisma.campaignLead.count({
        where: {
          campaignId: c.id,
          status: CampaignLeadStatus.ACTIVE,
          currentStep: 0,
          nextSendAt: { lte: now },
        },
      }),
      prisma.campaignLead.count({
        where: { campaignId: c.id, status: CampaignLeadStatus.ACTIVE },
      }),
    ]);

    totalDueFollowUps += dueFollowUps;
    totalDueNewMail += dueNewMail;

    campaignRows.push({
      id: c.id,
      name: c.name,
      status: c.status,
      dailyCap,
      sentToday,
      remainingToday: Math.max(0, dailyCap - sentToday),
      dueTotal: dueFollowUps + dueNewMail,
      dueFollowUps,
      dueNewMail,
      activeLeads,
      totalLeads: c._count.campaignLeads,
      stepCount: c._count.steps,
      threadFollowUps: c.threadFollowUps,
      sendGapSec: c.sendGapSec ?? 90,
      pinnedMailboxes: c.campaignAccounts.length,
    });
  }

  const mailboxCapacityRemaining = accounts
    .filter((a) => !a.disabled)
    .reduce((s, a) => s + Math.max(0, a.dailyLimit - a.sentToday), 0);

  return {
    at: now.toISOString(),
    globalPaused: settings.globalPaused,
    campaigns: campaignRows,
    mailboxes: accounts.map((a) => ({
      email: a.email,
      disabled: a.disabled,
      sentToday: a.sentToday,
      dailyLimit: a.dailyLimit,
      remaining: Math.max(0, a.dailyLimit - a.sentToday),
      gmailApiReady: isGoogleOAuthAccount(a),
    })),
    totals: {
      dueFollowUps: totalDueFollowUps,
      dueNewMail: totalDueNewMail,
      mailboxCapacityRemaining,
    },
  };
}

export function formatSnapshotForPrompt(snap: SystemSnapshot): string {
  const lines: string[] = [
    `Snapshot time: ${snap.at}`,
    `Global pause: ${snap.globalPaused ? "ON" : "off"}`,
    `Due follow-ups (all campaigns): ${snap.totals.dueFollowUps}`,
    `Due new Mail-1 (all campaigns): ${snap.totals.dueNewMail}`,
    `Mailbox capacity remaining today: ${snap.totals.mailboxCapacityRemaining}`,
    "",
    "Campaigns:",
  ];

  for (const c of snap.campaigns) {
    lines.push(
      `- "${c.name}" (${c.status}): ${c.sentToday}/${c.dailyCap} sent today, ` +
        `${c.dueFollowUps} follow-ups due, ${c.dueNewMail} new-mail due, ` +
        `${c.activeLeads}/${c.totalLeads} active, ${c.stepCount} steps, ` +
        `threading=${c.threadFollowUps}, gap=${c.sendGapSec}s, ` +
        `pinned mailboxes=${c.pinnedMailboxes || "all enabled"}`
    );
  }

  lines.push("", "Mailboxes:");
  for (const m of snap.mailboxes) {
    lines.push(
      `- ${m.email}: ${m.sentToday}/${m.dailyLimit} today, ` +
        `remaining=${m.remaining}, disabled=${m.disabled}, ` +
        `gmailApi=${m.gmailApiReady ? "ready" : "needs OAuth"}`
    );
  }

  return lines.join("\n");
}
