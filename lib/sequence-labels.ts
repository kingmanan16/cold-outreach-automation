import { CampaignLeadStatus } from "@prisma/client";

export function stepLabel(stepOrder: number, totalSteps: number): string {
  if (totalSteps <= 0) return "No sequence";
  if (stepOrder <= 0) return "Mail 1";
  if (stepOrder >= totalSteps) return "Finished";
  if (stepOrder === 1 && totalSteps > 1) return "Follow-up 1";
  if (stepOrder === 2 && totalSteps > 2) return "Follow-up 2";
  if (stepOrder === 3 && totalSteps > 3) return "Follow-up 3";
  return `Mail ${stepOrder + 1}`;
}

export type LeadProgress = {
  /** Mails actually delivered — never inferred from currentStep. */
  sentCount: number;
  status: CampaignLeadStatus;
  totalSteps: number;
};

/**
 * Progress counted from real SentEmail rows.
 *
 * currentStep alone lies: a lead that finished a 1-mail sequence keeps
 * status COMPLETED after a follow-up is added, which used to render as
 * "Done · 2 of 2" even though only one mail had ever been sent.
 */
export function progressLabel({
  sentCount,
  status,
  totalSteps,
}: LeadProgress): string {
  const done = Math.min(sentCount, totalSteps);

  if (status === CampaignLeadStatus.REPLIED) {
    return `Replied after mail ${Math.max(1, done)} of ${totalSteps}`;
  }
  if (
    status === CampaignLeadStatus.BOUNCED ||
    status === CampaignLeadStatus.STOPPED
  ) {
    return `Stopped · ${done} of ${totalSteps} sent`;
  }
  if (status === CampaignLeadStatus.COMPLETED) {
    return done >= totalSteps
      ? `Done · ${done} of ${totalSteps}`
      : `Behind · ${done} of ${totalSteps} sent`;
  }
  return `${done} of ${totalSteps} sent · next is mail ${Math.min(done + 1, totalSteps)}`;
}

export type SequenceUiStatus =
  | "waiting"
  | "due"
  | "replied"
  | "bounced"
  | "stopped"
  | "finished"
  | "behind"
  | "active";

export function sequenceUiStatus(opts: {
  status: CampaignLeadStatus;
  nextSendAt: Date | null;
  sentCount: number;
  totalSteps: number;
  now?: Date;
}): SequenceUiStatus {
  const now = opts.now ?? new Date();
  if (opts.status === CampaignLeadStatus.REPLIED) return "replied";
  if (opts.status === CampaignLeadStatus.BOUNCED) return "bounced";
  if (opts.status === CampaignLeadStatus.STOPPED) return "stopped";
  if (opts.status === CampaignLeadStatus.COMPLETED) {
    // Finished an older, shorter sequence — the newer mails will never reach
    // them until someone resumes the lead, so call that out separately.
    return opts.sentCount >= opts.totalSteps ? "finished" : "behind";
  }
  if (opts.nextSendAt && opts.nextSendAt.getTime() <= now.getTime()) return "due";
  if (opts.status === CampaignLeadStatus.ACTIVE) return "waiting";
  return "active";
}

export function sequenceStatusLabel(ui: SequenceUiStatus): string {
  switch (ui) {
    case "waiting":
      return "Waiting";
    case "due":
      return "Due now";
    case "replied":
      return "Replied — follow-ups stopped";
    case "bounced":
      return "Bounced";
    case "stopped":
      return "Stopped";
    case "finished":
      return "Finished";
    case "behind":
      return "Behind sequence — needs resume";
    default:
      return "In sequence";
  }
}

export function sequenceStatusChipClass(ui: SequenceUiStatus): string {
  switch (ui) {
    case "waiting":
      return "bg-zinc-100 text-zinc-700";
    case "due":
      return "bg-sky-100 text-sky-800";
    case "replied":
      return "bg-emerald-100 text-emerald-800";
    case "bounced":
      return "bg-red-100 text-red-800";
    case "stopped":
      return "bg-amber-100 text-amber-900";
    case "behind":
      return "bg-orange-100 text-orange-900";
    case "finished":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

export function stopReason(
  status: CampaignLeadStatus
): string {
  switch (status) {
    case CampaignLeadStatus.REPLIED:
      return "Reply";
    case CampaignLeadStatus.BOUNCED:
      return "Bounce";
    case CampaignLeadStatus.STOPPED:
      return "Manual / unsubscribed";
    case CampaignLeadStatus.COMPLETED:
      return "—";
    default:
      return "—";
  }
}

export function campaignStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Live";
    case "PAUSED":
      return "Paused";
    case "DRAFT":
      return "Draft";
    case "COMPLETED":
      return "Completed";
    default:
      return status;
  }
}

export function campaignStatusChipClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-accent-soft text-accent";
    case "PAUSED":
      return "bg-amber-100 text-amber-900";
    case "DRAFT":
      return "bg-slate-100 text-slate-700";
    case "COMPLETED":
      return "bg-sky-100 text-sky-900";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

/** Preset: Mail 1 + 3 follow-ups */
export function standardFourMailSteps(): Array<{
  subject: string;
  body: string;
  delayDays: number;
  subjectB: string;
  bodyB: string;
  winner: string;
}> {
  return [
    {
      subject: "Hi {{firstName}} — quick intro",
      body: `Hi {{firstName}},

I work with teams at companies like {{company}} and thought this might be relevant.

Would you be open to a short conversation?

Thanks`,
      delayDays: 0,
      subjectB: "",
      bodyB: "",
      winner: "",
    },
    {
      subject: "Following up, {{firstName}}",
      body: `Hi {{firstName}},

Just bumping this in case it got buried.

Happy to share a bit more if useful.

Best`,
      delayDays: 3,
      subjectB: "",
      bodyB: "",
      winner: "",
    },
    {
      subject: "Worth a look for {{company}}?",
      body: `Hi {{firstName}},

Wanted to check once more whether this is on your radar for {{company}}.

No worries if the timing is off.

Best`,
      delayDays: 3,
      subjectB: "",
      bodyB: "",
      winner: "",
    },
    {
      subject: "Last note from me, {{firstName}}",
      body: `Hi {{firstName}},

I'll close the loop on my side — if helpful later, feel free to reply anytime.

Thanks for your time.`,
      delayDays: 3,
      subjectB: "",
      bodyB: "",
      winner: "",
    },
  ];
}

export function mailTabLabel(index: number): string {
  if (index === 0) return "Mail 1";
  return `Follow-up ${index}`;
}
