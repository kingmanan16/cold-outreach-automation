/**
 * Outbound send ordering for campaign leads.
 *
 * Problem this solves: when 980 leads attach at once, every Mail-1 lead keeps
 * the oldest nextSendAt. Follow-ups (newer timestamps) never reach the front
 * of the queue unless we tier by sequence progress first.
 */

export type DueLeadSortable = {
  currentStep: number;
  nextSendAt: Date | null;
};

/** 0 = follow-up (higher priority), 1 = first mail still pending */
export function sendQueueTier(currentStep: number): number {
  return currentStep > 0 ? 0 : 1;
}

export function compareDueCampaignLeads(
  a: DueLeadSortable,
  b: DueLeadSortable
): number {
  const tierA = sendQueueTier(a.currentStep);
  const tierB = sendQueueTier(b.currentStep);
  if (tierA !== tierB) return tierA - tierB;

  const ta = a.nextSendAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const tb = b.nextSendAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;

  // Deeper in the sequence first when timestamps tie (e.g. same attach batch).
  return b.currentStep - a.currentStep;
}

export function sortDueCampaignLeads<T extends DueLeadSortable>(rows: T[]): T[] {
  return [...rows].sort(compareDueCampaignLeads);
}

/** Labels for logs / assistant context */
export function describeSendQueueMix(rows: DueLeadSortable[]): {
  followUpDue: number;
  newMailDue: number;
  total: number;
} {
  let followUpDue = 0;
  let newMailDue = 0;
  for (const r of rows) {
    if (sendQueueTier(r.currentStep) === 0) followUpDue += 1;
    else newMailDue += 1;
  }
  return { followUpDue, newMailDue, total: rows.length };
}
