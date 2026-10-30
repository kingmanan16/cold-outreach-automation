import { CampaignLeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NON_SENDABLE_LEAD_STATUSES } from "@/lib/lead-sending";
import { firstUnsentStep } from "@/lib/thread-continuity";

export type ReEnrollCandidate = {
  campaignLeadId: string;
  leadId: string;
  email: string;
  resumeStep: number;
  sentCount: number;
};

/**
 * Leads that finished an older, shorter sequence and are now behind it.
 *
 * Adding a follow-up does not touch CampaignLead rows, so everyone who already
 * ran out of steps sits at COMPLETED / nextSendAt null and would never be
 * picked up again. These are the rows that need waking.
 *
 * Deliberately excludes REPLIED, BOUNCED and STOPPED: those stopped for a
 * reason, and unsubscribed people must never be pulled back in.
 */
export async function findReEnrollCandidates(
  campaignId: string,
  leadIds?: string[]
): Promise<ReEnrollCandidate[]> {
  const totalSteps = await prisma.campaignStep.count({ where: { campaignId } });
  if (totalSteps === 0) return [];

  const finished = await prisma.campaignLead.findMany({
    where: {
      campaignId,
      status: CampaignLeadStatus.COMPLETED,
      ...(leadIds?.length ? { leadId: { in: leadIds } } : {}),
      lead: { status: { notIn: NON_SENDABLE_LEAD_STATUSES } },
    },
    select: {
      id: true,
      leadId: true,
      lead: { select: { email: true } },
    },
  });
  if (finished.length === 0) return [];

  // Diagnostics polls this every 30s, so ask only about the addresses in
  // hand rather than pulling the whole suppression list each time.
  const emails = finished.map((f) => f.lead.email.toLowerCase());
  const suppressed = new Set(
    (
      await prisma.suppression.findMany({
        where: { email: { in: emails, mode: "insensitive" } },
        select: { email: true },
      })
    ).map((s) => s.email.toLowerCase())
  );

  const sends = await prisma.sentEmail.findMany({
    where: {
      campaignId,
      leadId: { in: finished.map((f) => f.leadId) },
      bounced: false,
      isManualReply: false,
    },
    select: { leadId: true, stepOrder: true },
    distinct: ["leadId", "stepOrder"],
  });

  const byLead = new Map<string, Array<{ stepOrder: number | null }>>();
  for (const s of sends) {
    const list = byLead.get(s.leadId) ?? [];
    list.push({ stepOrder: s.stepOrder });
    byLead.set(s.leadId, list);
  }

  const candidates: ReEnrollCandidate[] = [];
  for (const cl of finished) {
    if (suppressed.has(cl.lead.email.toLowerCase())) continue;
    const prior = byLead.get(cl.leadId) ?? [];
    const resumeStep = firstUnsentStep(prior, totalSteps);
    // Already received every mail in the current sequence — genuinely done.
    if (resumeStep >= totalSteps) continue;
    candidates.push({
      campaignLeadId: cl.id,
      leadId: cl.leadId,
      email: cl.lead.email,
      resumeStep,
      sentCount: prior.length,
    });
  }
  return candidates;
}

/**
 * Put candidates back in the sequence at the first mail they never received.
 * `nextSendAt = now` only makes them due — the send window, daily cap and
 * pacing rules still apply.
 */
export async function reEnroll(
  candidates: ReEnrollCandidate[]
): Promise<number> {
  if (candidates.length === 0) return 0;
  const now = new Date();
  let updated = 0;
  for (const c of candidates) {
    await prisma.campaignLead.update({
      where: { id: c.campaignLeadId },
      data: {
        status: CampaignLeadStatus.ACTIVE,
        currentStep: c.resumeStep,
        nextSendAt: now,
      },
    });
    updated += 1;
  }
  return updated;
}
