import { CampaignLeadStatus, LeadStatus } from "@prisma/client";

/** Lead statuses that must not receive further sequence emails */
export const NON_SENDABLE_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.UNSUBSCRIBED,
  LeadStatus.BOUNCED,
  LeadStatus.INTERESTED,
  LeadStatus.NOT_INTERESTED,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.REPLIED,
];

/** Moving a lead to these statuses should stop active campaign sequences */
export const SEQUENCE_STOP_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.UNSUBSCRIBED,
  LeadStatus.BOUNCED,
  LeadStatus.INTERESTED,
  LeadStatus.NOT_INTERESTED,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
  LeadStatus.REPLIED,
];

/** Only promote early funnel statuses to CONTACTED after a send */
export const CONTACTABLE_FROM_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.QUEUED,
];

export function leadStatusBlocksSending(status: LeadStatus): boolean {
  return NON_SENDABLE_LEAD_STATUSES.includes(status);
}

export function shouldStopSequenceOnStatus(status: LeadStatus): boolean {
  return SEQUENCE_STOP_LEAD_STATUSES.includes(status);
}

export function nextLeadStatusAfterSend(current: LeadStatus): LeadStatus | null {
  if (CONTACTABLE_FROM_STATUSES.includes(current)) {
    return LeadStatus.CONTACTED;
  }
  return null;
}

export const STOPPED_CAMPAIGN_LEAD = {
  status: CampaignLeadStatus.STOPPED,
  nextSendAt: null as Date | null,
};
