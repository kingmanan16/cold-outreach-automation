import { NextResponse } from "next/server";
import { CampaignLeadStatus, CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCampaignDeferReason, type CampaignIdleReason } from "@/lib/send-window";
import { getSystemSettings } from "@/lib/notifications";
import { findReEnrollCandidates } from "@/lib/re-enroll";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: { campaignAccounts: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await getSystemSettings();
  const now = new Date();
  const windowReason = getCampaignDeferReason(campaign, now, {
    globalPaused: settings.globalPaused,
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [dueCount, dueFollowUps, dueNewMail, sentToday, totalSteps, totalLeads, activeLeads] =
    await Promise.all([
      prisma.campaignLead.count({
        where: {
          campaignId: params.id,
          status: CampaignLeadStatus.ACTIVE,
          nextSendAt: { lte: now },
        },
      }),
      prisma.campaignLead.count({
        where: {
          campaignId: params.id,
          status: CampaignLeadStatus.ACTIVE,
          currentStep: { gt: 0 },
          nextSendAt: { lte: now },
        },
      }),
      prisma.campaignLead.count({
        where: {
          campaignId: params.id,
          status: CampaignLeadStatus.ACTIVE,
          currentStep: 0,
          nextSendAt: { lte: now },
        },
      }),
      prisma.sentEmail.count({
        where: {
          campaignId: params.id,
          sentAt: { gte: startOfToday },
          bounced: false,
          isManualReply: false,
        },
      }),
      prisma.campaignStep.count({ where: { campaignId: params.id } }),
      prisma.campaignLead.count({ where: { campaignId: params.id } }),
      prisma.campaignLead.count({
        where: { campaignId: params.id, status: CampaignLeadStatus.ACTIVE },
      }),
    ]);

  // Only the mailboxes this campaign is actually allowed to send from.
  const pinnedIds = campaign.campaignAccounts.map((c) => c.accountId);
  const accounts = await prisma.emailAccount.findMany({
    where: {
      disabled: false,
      ...(pinnedIds.length ? { id: { in: pinnedIds } } : {}),
    },
  });
  const capacity = accounts.reduce(
    (sum, a) => sum + Math.max(0, a.dailyLimit - a.sentToday),
    0
  );

  const dailyCap = campaign.dailyCap ?? 45;
  const remainingToday = Math.max(0, dailyCap - sentToday);
  const reEnrollable = (await findReEnrollCandidates(params.id)).length;

  // Ordered most-actionable first; each reason maps to exactly one fix.
  let idleReason: CampaignIdleReason = null;
  if (settings.globalPaused) idleReason = "GLOBAL_PAUSED";
  else if (campaign.status !== CampaignStatus.ACTIVE) idleReason = "PAUSED";
  else if (totalSteps === 0) idleReason = "NO_SEQUENCE";
  else if (totalLeads === 0) idleReason = "NO_LEADS";
  else if (accounts.length === 0) idleReason = "MAILBOX_LIMIT_REACHED";
  else if (windowReason) idleReason = windowReason as CampaignIdleReason;
  else if (capacity <= 0) idleReason = "MAILBOX_LIMIT_REACHED";
  else if (remainingToday <= 0) idleReason = "CAMPAIGN_CAP_REACHED";
  else if (dueCount === 0 && reEnrollable > 0) idleReason = "LEADS_BEHIND_SEQUENCE";
  else if (dueCount === 0 && activeLeads === 0) idleReason = "ALL_LEADS_FINISHED";
  else if (dueCount === 0) idleReason = "NO_DUE_LEADS";

  return NextResponse.json({
    idleReason,
    // Kept so older clients keep rendering something sensible.
    deferredReason: idleReason,
    dueCount,
    dueFollowUps,
    dueNewMail,
    activeLeads,
    totalLeads,
    totalSteps,
    capacity,
    mailboxCount: accounts.length,
    reEnrollable,
    globalPaused: settings.globalPaused,
    status: campaign.status,
    timezone: campaign.timezone,
    scheduledStartAt: campaign.scheduledStartAt,
    sendWindowStartMin: campaign.sendWindowStartMin,
    sendWindowEndMin: campaign.sendWindowEndMin,
    dailyCap,
    sendGapSec: campaign.sendGapSec ?? 90,
    maxPerTick: campaign.maxPerTick ?? 5,
    threadFollowUps: campaign.threadFollowUps,
    sentToday,
    remainingToday,
  });
}
