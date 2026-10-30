export type SendWindowConfig = {
  timezone?: string | null;
  scheduledStartAt?: Date | string | null;
  sendWindowStartMin?: number | null;
  sendWindowEndMin?: number | null;
  sendDays?: unknown;
};

export type DeferReason =
  | "GLOBAL_PAUSED"
  | "PAUSED"
  | "BEFORE_START"
  | "OUTSIDE_WINDOW"
  | "WRONG_DAY"
  | "NO_ACCOUNT_CAPACITY"
  | "NO_DUE_LEADS"
  | null;

/**
 * Why a campaign is idle. Wider than DeferReason: the window checks above
 * cannot see leads, mailboxes or caps, and each of those needs its own fix,
 * so they must never collapse into one message.
 */
export type CampaignIdleReason =
  | Exclude<DeferReason, null | "NO_ACCOUNT_CAPACITY" | "NO_DUE_LEADS">
  | "NO_SEQUENCE"
  | "NO_LEADS"
  | "MAILBOX_LIMIT_REACHED"
  | "CAMPAIGN_CAP_REACHED"
  | "ALL_LEADS_FINISHED"
  | "LEADS_BEHIND_SEQUENCE"
  | "NO_DUE_LEADS"
  | null;

const DEFAULT_TZ = "Asia/Kolkata";
const DEFAULT_DAYS = [1, 2, 3, 4, 5];

export function parseSendDays(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6);
  }
  if (typeof raw === "string") {
    try {
      return parseSendDays(JSON.parse(raw));
    } catch {
      return DEFAULT_DAYS;
    }
  }
  return DEFAULT_DAYS;
}

function zonedParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    weekday: weekdayMap[get("weekday")] ?? 1,
    minutes: hour * 60 + minute,
    label: `${get("hour").padStart(2, "0")}:${get("minute").padStart(2, "0")}`,
  };
}

export function getCampaignDeferReason(
  campaign: SendWindowConfig & { status?: string },
  now = new Date(),
  opts?: { bypassWindow?: boolean; globalPaused?: boolean }
): DeferReason {
  if (opts?.globalPaused) return "GLOBAL_PAUSED";
  if (campaign.status && campaign.status !== "ACTIVE") return "PAUSED";

  // Send now / bypassWindowOnce skips start date, day-of-week, and hour window
  if (opts?.bypassWindow) return null;

  if (campaign.scheduledStartAt) {
    const start = new Date(campaign.scheduledStartAt);
    if (now < start) return "BEFORE_START";
  }

  const tz = campaign.timezone || DEFAULT_TZ;
  const { weekday, minutes } = zonedParts(now, tz);
  const days = parseSendDays(campaign.sendDays);
  if (!days.includes(weekday)) return "WRONG_DAY";

  const startMin = campaign.sendWindowStartMin ?? 9 * 60;
  const endMin = campaign.sendWindowEndMin ?? 18 * 60;
  if (minutes < startMin || minutes >= endMin) return "OUTSIDE_WINDOW";

  return null;
}

export function isCampaignSendable(
  campaign: SendWindowConfig & { status?: string },
  now = new Date(),
  opts?: { bypassWindow?: boolean; globalPaused?: boolean }
): boolean {
  return getCampaignDeferReason(campaign, now, opts) === null;
}

export function formatWindowLabel(
  campaign: SendWindowConfig,
  now = new Date()
): string {
  const tz = campaign.timezone || DEFAULT_TZ;
  const startMin = campaign.sendWindowStartMin ?? 9 * 60;
  const endMin = campaign.sendWindowEndMin ?? 18 * 60;
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const { label } = zonedParts(now, tz);
  return `Window ${fmt(startMin)}–${fmt(endMin)} ${tz} (now ${label})`;
}

/** @deprecated use isCampaignSendable — kept for older imports */
export function isWithinBusinessHours(now = new Date()): boolean {
  return isCampaignSendable(
    {
      timezone: DEFAULT_TZ,
      sendWindowStartMin: 9 * 60,
      sendWindowEndMin: 18 * 60,
      sendDays: DEFAULT_DAYS,
      status: "ACTIVE",
    },
    now
  );
}

export function istNowLabel(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(now);
}
