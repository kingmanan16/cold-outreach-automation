import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  CampaignLeadStatus,
  CampaignStatus,
  LeadStatus,
  PrismaClient,
} from "@prisma/client";
import { decrypt } from "../lib/encryption";
import { renderTemplate } from "../lib/template";
import {
  getCampaignDeferReason,
  formatWindowLabel,
} from "../lib/send-window";
import { categorizeReply } from "../lib/categorize-reply";
import {
  buildOutboundEmailBodies,
  newSentEmailId,
} from "../lib/tracking";
import { recordLeadEvent } from "../lib/lead-events";
import { emitWebhook, getSystemSettings } from "../lib/notifications";
import { pickAbVariant } from "../lib/ab-variant";
import { sendOutboundMail } from "../lib/mail-send";
import {
  getGoogleAccessToken,
  isGoogleOAuthAccount,
} from "../lib/gmail-oauth";
import {
  NON_SENDABLE_LEAD_STATUSES,
  leadStatusBlocksSending,
  nextLeadStatusAfterSend,
} from "../lib/lead-sending";
import {
  clampMaxPerTick,
  clampSendGapSec,
  nextFollowUpAt,
} from "../lib/send-pacing";
import { replySubject, threadHeaders } from "../lib/thread-continuity";
import { pickAccount } from "../lib/mailbox-picker";
import { sortDueCampaignLeads, describeSendQueueMix } from "../lib/send-queue";

const LOOP_MS = 2 * 60 * 1000;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();
globalForPrisma.prisma = prisma;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function outboundMailDisabled(): boolean {
  const v = (process.env.DISABLE_OUTBOUND_MAIL ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function waitForSendGap(gapSec: number) {
  const last = await prisma.sentEmail.findFirst({
    where: { isManualReply: false, bounced: false },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  if (!last?.sentAt) return;
  const waitMs = gapSec * 1000 - (Date.now() - last.sentAt.getTime());
  if (waitMs <= 0) return;
  console.log(`[sender] waiting ${Math.ceil(waitMs / 1000)}s for send gap`);
  await sleep(waitMs);
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function normalizeMessageId(id: string | undefined | null): string {
  if (!id) return "";
  return id.trim().toLowerCase().replace(/^<|>$/g, "");
}

function extractEmailAddress(
  value: string | { text?: string; value?: Array<{ address?: string }> } | undefined
): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/[\w.+-]+@[\w.-]+\.\w+/);
    return match ? match[0].toLowerCase() : null;
  }
  if (value.value?.[0]?.address) {
    return value.value[0].address.toLowerCase();
  }
  if (value.text) {
    const match = value.text.match(/[\w.+-]+@[\w.-]+\.\w+/);
    return match ? match[0].toLowerCase() : null;
  }
  return null;
}

function headerToString(
  headers: Map<string, string | string[] | undefined> | undefined,
  name: string
): string {
  if (!headers) return "";
  const raw = headers.get(name);
  if (!raw) return "";
  return Array.isArray(raw) ? raw.join(" ") : String(raw);
}

function isBounceAddress(email: string | null): boolean {
  if (!email) return false;
  const local = email.split("@")[0] ?? "";
  return /^(mailer-daemon|postmaster|mail-daemon|noreply-bounce)/i.test(local);
}

function isSmtpHardFail(err: unknown): boolean {
  const anyErr = err as { responseCode?: number; response?: string; message?: string };
  if (typeof anyErr.responseCode === "number" && anyErr.responseCode >= 500) {
    return true;
  }
  const text = `${anyErr.response ?? ""} ${anyErr.message ?? ""}`;
  return /\b5\d\d\b/.test(text);
}

function extractReferencedMessageIds(text: string): string[] {
  const matches = text.match(/<[^>]+@[^>]+>/g) ?? [];
  return matches;
}

async function resetDailyCounters() {
  const accounts = await prisma.emailAccount.findMany();
  const now = new Date();

  for (const account of accounts) {
    if (!isSameCalendarDay(account.lastResetDate, now)) {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: {
          sentToday: 0,
          lastResetDate: now,
        },
      });
      console.log(`[reset] ${account.email} sentToday -> 0`);
    }
  }
}

async function checkBounceRates() {
  const settings = await getSystemSettings();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const campaigns = await prisma.campaign.findMany({
    where: { status: CampaignStatus.ACTIVE },
    select: { id: true, name: true },
  });
  for (const c of campaigns) {
    const sent = await prisma.sentEmail.count({
      where: { campaignId: c.id, sentAt: { gte: since }, isManualReply: false },
    });
    if (sent < settings.bounceMinSample) continue;
    const bounced = await prisma.sentEmail.count({
      where: {
        campaignId: c.id,
        sentAt: { gte: since },
        bounced: true,
      },
    });
    const rate = bounced / sent;
    if (rate >= settings.bouncePauseThreshold) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { status: CampaignStatus.PAUSED },
      });
      console.warn(
        `[bounce-guard] paused campaign ${c.name} bounceRate=${(rate * 100).toFixed(1)}%`
      );
      await emitWebhook("bounce_pause", {
        campaignId: c.id,
        campaignName: c.name,
        rate,
        sent,
        bounced,
      });
    }
  }
}

async function processWarmup() {
  if (outboundMailDisabled()) {
    console.log("[warmup] DISABLE_OUTBOUND_MAIL — skipping");
    return;
  }
  const settings = await getSystemSettings();
  if (settings.globalPaused) return;

  const accounts = await prisma.emailAccount.findMany({
    where: { warmupEnabled: true, disabled: false },
  });
  if (accounts.length < 2) return;

  for (const from of accounts) {
    if (from.sentToday >= Math.min(5, from.dailyLimit)) continue;
    const to = accounts.find((a) => a.id !== from.id);
    if (!to) continue;
    try {
      const subject = `Warmup ping ${new Date().toISOString().slice(0, 10)}`;
      const info = await sendOutboundMail(from, {
        from: from.email,
        to: to.email,
        subject,
        text: "Automated warmup message — please mark as important if received.",
      });
      console.log(`[warmup] via=${info.via} ${from.email} -> ${to.email}`);
      await prisma.warmupMessage.create({
        data: {
          accountId: from.id,
          toEmail: to.email,
          subject,
        },
      });
      await prisma.emailAccount.update({
        where: { id: from.id },
        data: {
          sentToday: { increment: 1 },
          reputationScore: { increment: 0.1 },
        },
      });
      console.log(`[warmup] ${from.email} -> ${to.email}`);
    } catch (err) {
      console.error(`[warmup] failed ${from.email}`, err);
    }
  }
}

async function processDueSends() {
  if (outboundMailDisabled()) {
    console.log("[sender] DISABLE_OUTBOUND_MAIL — no real mail will be sent");
    return;
  }
  const settings = await getSystemSettings();
  if (settings.globalPaused) {
    console.log("[sender] global pause enabled — deferring all sends");
    return;
  }

  const now = new Date();

  const dueWhere = {
    status: CampaignLeadStatus.ACTIVE,
    nextSendAt: { lte: now },
    campaign: { status: CampaignStatus.ACTIVE },
    lead: {
      status: { notIn: NON_SENDABLE_LEAD_STATUSES },
    },
  } as const;

  const include = {
    lead: true,
    campaign: {
      include: {
        steps: { orderBy: { stepOrder: "asc" as const } },
        campaignAccounts: true,
      },
    },
  };

  // Two queries so follow-ups are never crowded out by thousands of Mail-1 rows
  // that share the oldest nextSendAt from list attach time.
  const [followUpDue, newMailDue] = await Promise.all([
    prisma.campaignLead.findMany({
      where: { ...dueWhere, currentStep: { gt: 0 } },
      include,
      orderBy: { nextSendAt: "asc" },
      take: 80,
    }),
    prisma.campaignLead.findMany({
      where: { ...dueWhere, currentStep: 0 },
      include,
      orderBy: { nextSendAt: "asc" },
      take: 80,
    }),
  ]);

  const due = sortDueCampaignLeads([...followUpDue, ...newMailDue]);
  const mix = describeSendQueueMix(due);

  console.log(
    `[sender] ${due.length} due (${mix.followUpDue} follow-up, ${mix.newMailDue} new mail)`
  );

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const campaignIds = Array.from(new Set(due.map((d) => d.campaignId)));
  const campaignSentToday = new Map<string, number>();
  const campaignSentThisTick = new Map<string, number>();
  for (const cid of campaignIds) {
    const n = await prisma.sentEmail.count({
      where: {
        campaignId: cid,
        sentAt: { gte: startOfToday },
        bounced: false,
        isManualReply: false,
      },
    });
    campaignSentToday.set(cid, n);
    campaignSentThisTick.set(cid, 0);
  }

  let sentThisTick = 0;

  for (const campaignLead of due) {
    const gapSec = clampSendGapSec(campaignLead.campaign.sendGapSec);
    const maxPerTick = clampMaxPerTick(campaignLead.campaign.maxPerTick);
    const dailyCap = campaignLead.campaign.dailyCap ?? 45;
    const sentForCampaign = campaignSentToday.get(campaignLead.campaignId) ?? 0;
    const tickForCampaign =
      campaignSentThisTick.get(campaignLead.campaignId) ?? 0;

    if (sentThisTick >= 20) {
      console.log("[sender] global tick cap reached — wait for next loop");
      break;
    }
    if (tickForCampaign >= maxPerTick) {
      console.log(
        `[sender] skip maxPerTick campaign=${campaignLead.campaignId} ${tickForCampaign}/${maxPerTick}`
      );
      continue;
    }
    if (sentForCampaign >= dailyCap) {
      console.log(
        `[sender] skip dailyCap campaign=${campaignLead.campaignId} sent=${sentForCampaign}/${dailyCap}`
      );
      continue;
    }

    const suppressed = await prisma.suppression.findUnique({
      where: { email: campaignLead.lead.email.toLowerCase() },
    });
    if (suppressed) {
      console.log(`[sender] skip suppressed ${campaignLead.lead.email}`);
      continue;
    }

    const defer = getCampaignDeferReason(campaignLead.campaign, new Date(), {
      bypassWindow: campaignLead.bypassWindowOnce,
      globalPaused: settings.globalPaused,
    });
    if (defer) {
      console.log(
        `[sender] defer ${campaignLead.lead.email} campaign=${campaignLead.campaignId} reason=${defer} ${formatWindowLabel(campaignLead.campaign, new Date())}`
      );
      continue;
    }

    if (leadStatusBlocksSending(campaignLead.lead.status)) {
      continue;
    }

    const step = campaignLead.campaign.steps.find(
      (s) => s.stepOrder === campaignLead.currentStep
    );
    if (!step) {
      console.warn(
        `[sender] skip — no step ${campaignLead.currentStep} for ${campaignLead.lead.email}`
      );
      continue;
    }

    // One read serves both the duplicate guard and the reply headers below.
    const priorSends = await prisma.sentEmail.findMany({
      where: {
        campaignId: campaignLead.campaignId,
        leadId: campaignLead.leadId,
        bounced: false,
        isManualReply: false,
      },
      orderBy: { sentAt: "asc" },
      select: { messageId: true, subject: true, stepOrder: true, accountId: true },
    });

    const already = priorSends.some((s) => s.stepOrder === step.stepOrder);
    if (already) {
      const nextStepOrder = campaignLead.currentStep + 1;
      const nextStep = campaignLead.campaign.steps.find(
        (s) => s.stepOrder === nextStepOrder
      );
      await prisma.campaignLead.update({
        where: { id: campaignLead.id },
        data: nextStep
          ? {
              currentStep: nextStepOrder,
              nextSendAt: nextFollowUpAt(new Date(), nextStep.delayDays),
            }
          : {
              currentStep: nextStepOrder,
              status: CampaignLeadStatus.COMPLETED,
              nextSendAt: null,
            },
      });
      console.log(
        `[sender] skip duplicate step ${step.stepOrder} for ${campaignLead.lead.email} — already sent`
      );
      continue;
    }

    const lockUntil = new Date(Date.now() + 20 * 60 * 1000);
    const claimed = await prisma.campaignLead.updateMany({
      where: {
        id: campaignLead.id,
        status: CampaignLeadStatus.ACTIVE,
        nextSendAt: { lte: now },
      },
      data: { nextSendAt: lockUntil, bypassWindowOnce: false },
    });
    if (claimed.count !== 1) {
      console.log(
        `[sender] skip race ${campaignLead.lead.email} — another tick claimed it`
      );
      continue;
    }

    const pick = await pickAccount(
      prisma,
      campaignLead.campaignId,
      campaignLead.leadId
    );
    if (!pick.ok) {
      // The claim above consumed bypassWindowOnce; nothing was sent, so a
      // "Send now" the operator paid for must survive the retry.
      const bypass = campaignLead.bypassWindowOnce;
      if (pick.reason === "ORIGINAL_MAILBOX_BUSY") {
        // Hold this lead for its own mailbox; other leads may still go out.
        await prisma.campaignLead.update({
          where: { id: campaignLead.id },
          data: {
            nextSendAt: new Date(Date.now() + 30 * 60 * 1000),
            bypassWindowOnce: bypass,
          },
        });
        console.log(
          `[sender] hold ${campaignLead.lead.email} — ${pick.accountEmail} is at its daily limit, not switching sender mid-thread`
        );
        continue;
      }
      await prisma.campaignLead.update({
        where: { id: campaignLead.id },
        data: { nextSendAt: now, bypassWindowOnce: bypass },
      });
      console.warn("[sender] skip — no EmailAccount under daily limit");
      break;
    }
    const account = pick.account;

    await waitForSendGap(gapSec);

    const {
      variant: subjectVariant,
      subjectTemplate,
      bodyTemplate,
    } = pickAbVariant(step);

    // Follow-ups continue Mail 1's conversation instead of starting a new one.
    const thread = campaignLead.campaign.threadFollowUps
      ? threadHeaders(priorSends)
      : null;
    const subject = thread
      ? replySubject(thread.rootSubject)
      : renderTemplate(subjectTemplate, campaignLead.lead);
    const renderedBody = renderTemplate(bodyTemplate, campaignLead.lead);
    const sentEmailId = newSentEmailId();
    const { text: trackedText, html: htmlBody } = buildOutboundEmailBodies(
      renderedBody,
      sentEmailId
    );

    try {
      const info = await sendOutboundMail(account, {
        from: account.email,
        to: campaignLead.lead.email,
        subject,
        text: trackedText,
        html: htmlBody,
        inReplyTo: thread?.inReplyTo,
        references: thread?.references,
      });

      const messageId = info.messageId;
      const nextStepOrder = campaignLead.currentStep + 1;
      const nextStep = campaignLead.campaign.steps.find(
        (s) => s.stepOrder === nextStepOrder
      );

      await prisma.$transaction(async (tx) => {
        await tx.sentEmail.create({
          data: {
            id: sentEmailId,
            leadId: campaignLead.leadId,
            accountId: account.id,
            campaignId: campaignLead.campaignId,
            stepOrder: step.stepOrder,
            subject,
            subjectVariant,
            messageId,
            inReplyToMessageId: thread?.inReplyTo ?? null,
            sentAt: new Date(),
          },
        });
        await tx.emailAccount.update({
          where: { id: account.id },
          data: { sentToday: { increment: 1 } },
        });
        if (!nextStep) {
          await tx.campaignLead.update({
            where: { id: campaignLead.id },
            data: {
              currentStep: nextStepOrder,
              status: CampaignLeadStatus.COMPLETED,
              nextSendAt: null,
              lastMessageId: messageId,
              bypassWindowOnce: false,
            },
          });
        } else {
          await tx.campaignLead.update({
            where: { id: campaignLead.id },
            data: {
              currentStep: nextStepOrder,
              nextSendAt: nextFollowUpAt(new Date(), nextStep.delayDays),
              lastMessageId: messageId,
              bypassWindowOnce: false,
            },
          });
        }
        const promoted = nextLeadStatusAfterSend(campaignLead.lead.status);
        if (promoted) {
          await tx.lead.update({
            where: { id: campaignLead.leadId },
            data: { status: promoted },
          });
        }
      });

      await recordLeadEvent(campaignLead.leadId, "email_sent", {
        campaignId: campaignLead.campaignId,
        stepOrder: step.stepOrder,
        accountId: account.id,
        subject,
        subjectVariant,
      });

      campaignSentToday.set(
        campaignLead.campaignId,
        (campaignSentToday.get(campaignLead.campaignId) ?? 0) + 1
      );
      campaignSentThisTick.set(
        campaignLead.campaignId,
        (campaignSentThisTick.get(campaignLead.campaignId) ?? 0) + 1
      );
      sentThisTick += 1;

      console.log(
        `[sender] sent to=${campaignLead.lead.email} step=${step.stepOrder} via=${account.email}${
          pick.sticky ? " (same mailbox as mail 1)" : ""
        }${thread ? " threaded" : ""} gap=${gapSec}s messageId=${messageId}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[sender] send error for ${campaignLead.lead.email}: ${message}`
      );

      await prisma.campaignLead.update({
        where: { id: campaignLead.id },
        data: { nextSendAt: new Date(Date.now() + gapSec * 1000) },
      });

      if (
        message.includes("Connect Google OAuth") ||
        message.includes("SMTP blocked on Railway") ||
        message.includes("token refresh")
      ) {
        console.error(
          "[sender] fix OAuth / env, then redeploy — not marking lead bounced"
        );
        break;
      }

      if (isSmtpHardFail(err)) {
        const bounceId = `bounce-smtp-${campaignLead.id}-${Date.now()}@local`;
        await prisma.$transaction(async (tx) => {
          await tx.sentEmail.create({
            data: {
              id: sentEmailId,
              leadId: campaignLead.leadId,
              accountId: account.id,
              campaignId: campaignLead.campaignId,
              stepOrder: step.stepOrder,
              subject,
              subjectVariant,
              messageId: bounceId,
              sentAt: new Date(),
              bounced: true,
            },
          });
          await tx.lead.update({
            where: { id: campaignLead.leadId },
            data: { status: LeadStatus.BOUNCED },
          });
          await tx.campaignLead.update({
            where: { id: campaignLead.id },
            data: {
              status: CampaignLeadStatus.BOUNCED,
              nextSendAt: null,
            },
          });
        });
        console.log(
          `[sender] marked bounce for ${campaignLead.lead.email} (5xx SMTP failure)`
        );
      }
    }
  }
}

async function matchLeadId(opts: {
  fromEmail: string | null;
  inReplyTo: string;
  references: string;
}): Promise<string | null> {
  if (opts.fromEmail && !isBounceAddress(opts.fromEmail)) {
    const lead = await prisma.lead.findUnique({
      where: { email: opts.fromEmail },
    });
    if (lead) return lead.id;
  }

  const candidates = [
    ...opts.inReplyTo.split(/\s+/),
    ...opts.references.split(/\s+/),
  ]
    .map((id) => id.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeMessageId(candidate);
    if (!normalized) continue;

    const sent = await prisma.sentEmail.findFirst({
      where: {
        OR: [
          { messageId: candidate },
          { messageId: `<${normalized}>` },
          { messageId: normalized },
        ],
      },
    });
    if (sent) return sent.leadId;
  }

  return null;
}

async function handleBounceNotification(opts: {
  accountId: string;
  fromEmail: string | null;
  inReplyTo: string;
  references: string;
  bodyText: string;
}) {
  if (!isBounceAddress(opts.fromEmail)) return false;

  const candidates = [
    ...opts.inReplyTo.split(/\s+/),
    ...opts.references.split(/\s+/),
    ...extractReferencedMessageIds(opts.bodyText),
  ]
    .map((id) => id.trim())
    .filter(Boolean);

  let sent = null as Awaited<ReturnType<typeof prisma.sentEmail.findFirst>>;

  for (const candidate of candidates) {
    const normalized = normalizeMessageId(candidate);
    if (!normalized) continue;
    sent = await prisma.sentEmail.findFirst({
      where: {
        OR: [
          { messageId: candidate },
          { messageId: `<${normalized}>` },
          { messageId: normalized },
        ],
      },
    });
    if (sent) break;
  }

  if (!sent) {
    console.warn("[poller] bounce detected but no matching SentEmail");
    return true;
  }

  await prisma.$transaction(async (tx) => {
    await tx.sentEmail.update({
      where: { id: sent!.id },
      data: { bounced: true },
    });
    await tx.lead.update({
      where: { id: sent!.leadId },
      data: { status: LeadStatus.BOUNCED },
    });
    await tx.campaignLead.updateMany({
      where: { leadId: sent!.leadId, status: CampaignLeadStatus.ACTIVE },
      data: { status: CampaignLeadStatus.BOUNCED, nextSendAt: null },
    });
  });

  console.log(`[poller] bounce handled for lead=${sent.leadId} sentEmail=${sent.id}`);
  return true;
}

async function processAccountInbox(account: {
  id: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassEnc: string;
  oauthProvider?: string | null;
  oauthAccessEnc?: string | null;
  oauthRefreshEnc?: string | null;
  oauthExpiry?: Date | null;
  lastCheckedAt: Date | null;
  disabled?: boolean;
}) {
  if (account.disabled) {
    console.log(`[poller] skip disabled ${account.email}`);
    return;
  }

  const since =
    account.lastCheckedAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const checkedAt = new Date();

  // Test IMAP uses the stored password. Worker used to prefer a stale OAuth
  // access token (often without IMAP scope) → Command failed / crash.
  // Prefer App Password when present; otherwise refresh OAuth for XOAUTH2.
  let imapAuth: { user: string; pass: string } | { user: string; accessToken: string };
  const pass = account.imapPassEnc ? decrypt(account.imapPassEnc).trim() : "";
  if (pass) {
    imapAuth = { user: account.imapUser, pass };
  } else if (isGoogleOAuthAccount(account)) {
    const accessToken = await getGoogleAccessToken(account);
    imapAuth = { user: account.imapUser, accessToken };
  } else {
    throw new Error("No IMAP password or Google OAuth on this account");
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: imapAuth,
    logger: false,
    socketTimeout: 60_000,
    greetingTimeout: 30_000,
  });

  // Without this, imapflow "error" events crash the whole worker (unhandled).
  client.on("error", (err) => {
    console.error(
      `[poller] imap socket error ${account.email}: ${err instanceof Error ? err.message : String(err)}`
    );
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since });
      const list = Array.isArray(uids) ? uids : [];
      console.log(
        `[poller] ${account.email} — ${list.length} message(s) since ${since.toISOString()}`
      );

      if (list.length > 0) {
        for await (const msg of client.fetch(list, {
          uid: true,
          envelope: true,
          source: true,
        })) {
          try {
            const parsed = await simpleParser(msg.source as Buffer);
            const fromEmail = extractEmailAddress(parsed.from ?? undefined);
            const inReplyTo =
              typeof parsed.inReplyTo === "string"
                ? parsed.inReplyTo
                : headerToString(
                    parsed.headers as Map<
                      string,
                      string | string[] | undefined
                    >,
                    "in-reply-to"
                  );
            const references = Array.isArray(parsed.references)
              ? parsed.references.join(" ")
              : typeof parsed.references === "string"
                ? parsed.references
                : headerToString(
                    parsed.headers as Map<
                      string,
                      string | string[] | undefined
                    >,
                    "references"
                  );
            const replyMessageId =
              typeof parsed.messageId === "string" ? parsed.messageId : null;
            const bodyText =
              typeof parsed.text === "string"
                ? parsed.text
                : typeof parsed.html === "string"
                  ? parsed.html.replace(/<[^>]+>/g, " ")
                  : "";
            const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 280);

            const wasBounce = await handleBounceNotification({
              accountId: account.id,
              fromEmail,
              inReplyTo,
              references,
              bodyText,
            });
            if (wasBounce) continue;

            if (fromEmail && fromEmail === account.email.toLowerCase()) {
              continue;
            }
            const ownAccounts = await prisma.emailAccount.findMany({
              select: { email: true },
            });
            if (
              fromEmail &&
              ownAccounts.some((a) => a.email.toLowerCase() === fromEmail)
            ) {
              continue;
            }

            const leadId = await matchLeadId({
              fromEmail,
              inReplyTo,
              references,
            });
            if (!leadId) continue;

            if (replyMessageId) {
              const existing = await prisma.reply.findUnique({
                where: { messageId: replyMessageId },
              });
              if (existing) continue;
            } else {
              const existing = await prisma.reply.findFirst({
                where: { leadId, accountId: account.id, snippet },
              });
              if (existing) continue;
            }

            const receivedAt = parsed.date ?? new Date();

            let category: string | null = null;
            try {
              category = await categorizeReply(snippet || bodyText.slice(0, 500));
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[ai] categorization failed: ${message}`);
            }

            await prisma.$transaction(async (tx) => {
              await tx.reply.create({
                data: {
                  leadId,
                  accountId: account.id,
                  receivedAt,
                  snippet,
                  body: bodyText.slice(0, 10000),
                  messageId: replyMessageId,
                  category,
                },
              });

              const nextStatus =
                category === "interested"
                  ? LeadStatus.INTERESTED
                  : category === "not_interested"
                    ? LeadStatus.NOT_INTERESTED
                    : LeadStatus.REPLIED;

              await tx.lead.update({
                where: { id: leadId },
                data: { status: nextStatus },
              });

              await tx.campaignLead.updateMany({
                where: {
                  leadId,
                  status: CampaignLeadStatus.ACTIVE,
                },
                data: { status: CampaignLeadStatus.REPLIED },
              });
            });

            await recordLeadEvent(leadId, "reply_received", {
              category,
              accountId: account.id,
              snippet: snippet.slice(0, 200),
            });
            if (category === "interested") {
              await emitWebhook("interested_reply", { leadId, snippet });
            }

            console.log(
              `[poller] reply matched lead=${leadId} from=${fromEmail ?? "unknown"} category=${category ?? "none"} snippet="${snippet.slice(0, 80)}"`
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error(
              `[poller] failed processing message for ${account.email}: ${message}`
            );
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: { lastCheckedAt: checkedAt },
  });
  console.log(`[poller] ${account.email} lastCheckedAt -> ${checkedAt.toISOString()}`);
}

async function pollReplies() {
  const accounts = await prisma.emailAccount.findMany({
    where: { disabled: false },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[poller] checking ${accounts.length} account inbox(es)`);

  for (const account of accounts) {
    try {
      await processAccountInbox(account);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[poller] IMAP error for ${account.email}: ${message}`);
    }
  }
}

let senderBusy = false;
let pollerBusy = false;

async function senderTick() {
  if (senderBusy) {
    console.log("[sender] overlapping tick skipped");
    return;
  }
  senderBusy = true;
  console.log(`[sender-tick] ${new Date().toISOString()}`);
  try {
    await resetDailyCounters();
    await checkBounceRates();
    await processWarmup();
    await processDueSends();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sender-tick-error] ${message}`);
  } finally {
    senderBusy = false;
  }
}

async function pollerTick() {
  if (pollerBusy) {
    console.log("[poller] overlapping tick skipped");
    return;
  }
  pollerBusy = true;
  console.log(`[poller-tick] ${new Date().toISOString()}`);
  try {
    await pollReplies();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[poller-tick-error] ${message}`);
  } finally {
    pollerBusy = false;
  }
}

console.log("Worker started — sender + reply poller every 2 minutes");

async function boot() {
  const accounts = await prisma.emailAccount.findMany({
    where: { disabled: false },
    select: {
      email: true,
      oauthProvider: true,
      oauthAccessEnc: true,
      oauthRefreshEnc: true,
    },
  });
  for (const a of accounts) {
    const oauth = isGoogleOAuthAccount(a);
    console.log(
      `[boot] mailbox ${a.email} sendVia=${oauth ? "gmail-api" : "smtp-only (needs Google OAuth on Railway)"}`
    );
  }
  if (
    !accounts.some((a) => isGoogleOAuthAccount(a)) &&
    (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)
  ) {
    console.error(
      "[boot] WARNING: No Google OAuth mailboxes. Railway blocks SMTP — connect OAuth or sends will fail."
    );
  }

  await pollerTick();
  await senderTick();
}

void boot();
setInterval(() => {
  void pollerTick();
}, LOOP_MS);
setInterval(() => {
  void senderTick();
}, LOOP_MS);
