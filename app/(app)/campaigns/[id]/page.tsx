import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignLeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CampaignStatusControls } from "@/components/CampaignStatusControls";
import { CampaignScheduleForm } from "@/components/CampaignScheduleForm";
import { CampaignDeferBanner } from "@/components/CampaignDeferBanner";
import { CampaignAccountPicker } from "@/components/CampaignAccountPicker";
import { CampaignSendNowButton } from "@/components/CampaignSendNowButton";
import { CampaignDailyCapForm } from "@/components/CampaignDailyCapForm";
import { CampaignSequenceTable } from "@/components/CampaignSequenceTable";
import { CampaignReEnrollButton } from "@/components/CampaignReEnrollButton";
import { formatWindowLabel } from "@/lib/send-window";
import { replySubject } from "@/lib/thread-continuity";
import {
  campaignStatusChipClass,
  campaignStatusLabel,
  mailTabLabel,
  sequenceUiStatus,
} from "@/lib/sequence-labels";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { stepOrder: "asc" } },
      campaignLeads: {
        include: { lead: true },
        orderBy: { id: "asc" },
      },
      campaignAccounts: true,
    },
  });

  if (!campaign) notFound();

  const totalSteps = campaign.steps.length;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const accounts = await prisma.emailAccount.findMany({
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      dailyLimit: true,
      sentToday: true,
      disabled: true,
    },
  });

  const pinnedIds = new Set(campaign.campaignAccounts.map((c) => c.accountId));
  const sendAccounts =
    pinnedIds.size > 0
      ? accounts.filter((a) => pinnedIds.has(a.id) && !a.disabled)
      : accounts.filter((a) => !a.disabled);

  const [emailsSent, repliesReceived, sentToday, lastSents] = await Promise.all([
    prisma.sentEmail.count({
      where: { campaignId: campaign.id, bounced: false, isManualReply: false },
    }),
    prisma.reply.count({
      where: {
        lead: { sentEmails: { some: { campaignId: campaign.id } } },
      },
    }),
    prisma.sentEmail.count({
      where: {
        campaignId: campaign.id,
        sentAt: { gte: startOfToday },
        bounced: false,
        isManualReply: false,
      },
    }),
    prisma.sentEmail.findMany({
      where: {
        campaignId: campaign.id,
        bounced: false,
        isManualReply: false,
      },
      orderBy: { sentAt: "desc" },
      distinct: ["leadId"],
      select: { leadId: true, sentAt: true },
    }),
  ]);

  const lastSentMap = new Map(
    lastSents.map((s) => [s.leadId, s.sentAt.toISOString()])
  );

  // Real per-lead delivery counts. Progress must never be inferred from
  // currentStep — that keeps its old value when the sequence grows.
  const perLeadSends = await prisma.sentEmail.groupBy({
    by: ["leadId"],
    where: { campaignId: campaign.id, bounced: false, isManualReply: false },
    _count: { _all: true },
  });
  const sentCountMap = new Map(
    perLeadSends.map((s) => [s.leadId, s._count._all])
  );

  const dailyCap = campaign.dailyCap ?? 45;
  const remainingToday = Math.max(0, dailyCap - sentToday);
  const mailboxCapacity = sendAccounts.reduce(
    (s, a) => s + Math.max(0, a.dailyLimit - a.sentToday),
    0
  );

  const funnel = {
    waiting: 0,
    due: 0,
    replied: 0,
    finished: 0,
    behind: 0,
    stopped: 0,
    byMail: Array.from({ length: Math.max(totalSteps, 1) }, () => 0),
  };

  for (const cl of campaign.campaignLeads) {
    const sentCount = sentCountMap.get(cl.leadId) ?? 0;
    const ui = sequenceUiStatus({
      status: cl.status,
      nextSendAt: cl.nextSendAt,
      sentCount,
      totalSteps,
    });
    if (ui === "replied") funnel.replied += 1;
    else if (ui === "finished") funnel.finished += 1;
    else if (ui === "behind") funnel.behind += 1;
    else if (ui === "stopped" || ui === "bounced") funnel.stopped += 1;
    else if (ui === "due") funnel.due += 1;
    else funnel.waiting += 1;

    if (
      cl.status === CampaignLeadStatus.ACTIVE &&
      cl.currentStep >= 0 &&
      cl.currentStep < totalSteps
    ) {
      funnel.byMail[cl.currentStep] += 1;
    }
  }

  const replyRate =
    emailsSent === 0
      ? "—"
      : `${Math.round((repliesReceived / emailsSent) * 1000) / 10}%`;

  const sequenceRows = campaign.campaignLeads.map((cl) => ({
    id: cl.id,
    leadId: cl.leadId,
    email: cl.lead.email,
    name: [cl.lead.firstName, cl.lead.lastName].filter(Boolean).join(" "),
    sentCount: sentCountMap.get(cl.leadId) ?? 0,
    status: cl.status,
    nextSendAt: cl.nextSendAt?.toISOString() ?? null,
    lastSentAt: lastSentMap.get(cl.leadId) ?? null,
  }));

  const windowLabel = formatWindowLabel(campaign);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/campaigns"
            className="text-sm text-ink-mute transition hover:text-ink"
          >
            ← Campaigns
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="page-title">{campaign.name}</h1>
            <span
              className={`chip ${campaignStatusChipClass(campaign.status)}`}
            >
              {campaignStatusLabel(campaign.status)}
            </span>
          </div>
          <p className="page-subtitle">
            {campaign.campaignLeads.length} leads · {totalSteps} mail
            {totalSteps === 1 ? "" : "s"} in sequence · {windowLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/campaigns/${campaign.id}/edit`}
            className="btn-secondary"
          >
            Edit sequence
          </Link>
        </div>
      </div>

      <CampaignDeferBanner campaignId={campaign.id} />

      {/* Pace */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className="surface-card p-5 lg:col-span-4">
          <p className="section-label">Today&apos;s pace</p>
          <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-ink">
            {sentToday}
            <span className="text-lg font-normal text-ink-mute">
              {" "}
              / {dailyCap}
            </span>
          </p>
          <p className="mt-1 text-sm text-ink-mute">
            {remainingToday} left under campaign cap · mailbox room ~
            {mailboxCapacity}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${Math.min(100, dailyCap === 0 ? 0 : (sentToday / dailyCap) * 100)}%`,
              }}
            />
          </div>
        </div>

        <div className="surface-card p-5 lg:col-span-5">
          <p className="mb-3 section-label">Sequence funnel</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Due now", n: funnel.due },
              { label: "Waiting", n: funnel.waiting },
              ...funnel.byMail.map((n, i) => ({
                label: mailTabLabel(i),
                n,
              })),
              { label: "Replied", n: funnel.replied },
              { label: "Finished", n: funnel.finished },
              { label: "Behind", n: funnel.behind },
              { label: "Stopped", n: funnel.stopped },
            ].map((chip) => (
              <div
                key={chip.label}
                className="rounded-xl border border-line/70 bg-slate-50/80 px-3 py-2"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-mute">
                  {chip.label}
                </p>
                <p className="font-display text-lg font-semibold tabular-nums text-ink">
                  {chip.n}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card p-5 lg:col-span-3">
          <p className="section-label">Results</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-mute">Emails sent</dt>
              <dd className="font-medium tabular-nums text-ink">{emailsSent}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mute">Replies</dt>
              <dd className="font-medium tabular-nums text-ink">
                {repliesReceived}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mute">Reply rate</dt>
              <dd className="font-medium tabular-nums text-ink">{replyRate}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-mute">
            Reply automatically stops remaining follow-ups for that lead.
          </p>
        </div>
      </section>

      {/* Mailboxes */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Mailboxes</h2>
        <div className="flex flex-wrap gap-2">
          {sendAccounts.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No mailboxes available. Add accounts first.
            </p>
          ) : (
            sendAccounts.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
              >
                <p className="font-medium text-zinc-900">{a.email}</p>
                <p className="text-xs text-zinc-500">
                  {a.sentToday}/{a.dailyLimit} today
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Controls */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Sending status
          </h2>
          <CampaignStatusControls
            campaignId={campaign.id}
            currentStatus={campaign.status}
            leadCount={campaign.campaignLeads.length}
            dailyCapacity={Math.min(remainingToday, mailboxCapacity)}
          />
          <div className="mt-4 border-t border-zinc-100 pt-4">
            <CampaignSendNowButton
              campaignId={campaign.id}
              maxPerTick={campaign.maxPerTick ?? 5}
              label="Send due leads now (bypass window once)"
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">
            Sending pace &amp; threading
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            How fast this campaign sends, and whether follow-ups continue Mail
            1&apos;s conversation.
          </p>
          <CampaignDailyCapForm
            campaignId={campaign.id}
            dailyCap={dailyCap}
            sendGapSec={campaign.sendGapSec ?? 90}
            maxPerTick={campaign.maxPerTick ?? 5}
            threadFollowUps={campaign.threadFollowUps}
          />
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Schedule</h2>
        <CampaignScheduleForm
          campaignId={campaign.id}
          timezone={campaign.timezone}
          scheduledStartAt={campaign.scheduledStartAt}
          sendWindowStartMin={campaign.sendWindowStartMin}
          sendWindowEndMin={campaign.sendWindowEndMin}
          sendDays={campaign.sendDays}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Which mailboxes send this campaign
        </h2>
        <CampaignAccountPicker
          campaignId={campaign.id}
          accounts={accounts}
          selectedIds={campaign.campaignAccounts.map((c) => c.accountId)}
        />
      </section>

      {/* Sequence preview */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Sequence</h2>
            <p className="text-sm text-zinc-500">
              {campaign.threadFollowUps
                ? "Follow-ups reply inside Mail 1's thread, from the mailbox that sent it."
                : "Each mail sends as its own new email with its own subject."}
            </p>
          </div>
          <Link
            href={`/campaigns/${campaign.id}/edit`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Edit sequence
          </Link>
        </div>
        {campaign.steps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-600">No mails in this sequence yet.</p>
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="mt-3 inline-block text-sm font-medium text-zinc-900 underline"
            >
              Add standard 4-mail sequence
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {campaign.steps.map((step, i) => (
              <div
                key={step.id}
                className="rounded-xl border border-zinc-200 bg-white p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {mailTabLabel(i)}
                  {i > 0 ? ` · +${step.delayDays}d` : " · day 0"}
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-zinc-900">
                  {campaign.threadFollowUps && i > 0
                    ? replySubject(campaign.steps[0]?.subject ?? step.subject)
                    : step.subject}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-zinc-500">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tracker */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">Lead progress</h2>
          <p className="text-sm text-zinc-500">
            Counted from mails actually delivered, not from the step pointer.
          </p>
        </div>
        {funnel.behind > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
            <div className="text-sm text-orange-950">
              <p className="font-medium">
                {funnel.behind} lead{funnel.behind === 1 ? "" : "s"} finished an
                older, shorter version of this sequence.
              </p>
              <p className="mt-0.5 text-xs text-orange-900/85">
                They will never receive the newer mails until you resume them.
                Nothing they already got is sent twice.
              </p>
            </div>
            <CampaignReEnrollButton
              campaignId={campaign.id}
              count={funnel.behind}
            />
          </div>
        )}
        {campaign.campaignLeads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-zinc-600">No leads attached yet.</p>
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="mt-3 inline-block text-sm font-medium text-zinc-900 underline"
            >
              Attach a lead list
            </Link>
          </div>
        ) : (
          <CampaignSequenceTable
            campaignId={campaign.id}
            rows={sequenceRows}
            totalSteps={totalSteps || 1}
            maxPerTick={campaign.maxPerTick ?? 5}
          />
        )}
      </section>
    </div>
  );
}
