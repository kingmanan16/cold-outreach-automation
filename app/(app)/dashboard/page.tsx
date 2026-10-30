import Link from "next/link";
import { CampaignLeadStatus, CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  campaignStatusChipClass,
  campaignStatusLabel,
} from "@/lib/sequence-labels";
import { CampaignPauseResume } from "@/components/CampaignPauseResume";

export default async function DashboardPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [
    sentToday,
    repliesToday,
    dueToday,
    activeCampaigns,
    unreadReplies,
  ] = await Promise.all([
    prisma.sentEmail.count({
      where: {
        sentAt: { gte: startOfToday },
        bounced: false,
        isManualReply: false,
      },
    }),
    prisma.reply.count({
      where: { receivedAt: { gte: startOfToday } },
    }),
    prisma.campaignLead.count({
      where: {
        status: CampaignLeadStatus.ACTIVE,
        nextSendAt: { lte: endOfToday },
        campaign: { status: CampaignStatus.ACTIVE },
      },
    }),
    prisma.campaign.findMany({
      where: { status: { in: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED] } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { campaignLeads: true, steps: true } },
        campaignLeads: {
          select: { status: true, currentStep: true },
        },
      },
      take: 8,
    }),
    prisma.reply.count({ where: { readAt: null } }),
  ]);

  const sentTodayByCampaign = await prisma.sentEmail.groupBy({
    by: ["campaignId"],
    where: {
      sentAt: { gte: startOfToday },
      bounced: false,
      isManualReply: false,
      campaignId: { not: null },
    },
    _count: { _all: true },
  });
  const sentMap = new Map(
    sentTodayByCampaign.map((r) => [r.campaignId!, r._count._all])
  );

  let capRemaining = 0;
  for (const c of activeCampaigns.filter((x) => x.status === CampaignStatus.ACTIVE)) {
    const used = sentMap.get(c.id) ?? 0;
    capRemaining += Math.max(0, (c.dailyCap ?? 45) - used);
  }

  const cards = [
    { label: "Due today", value: dueToday, hint: "Active leads ready to send" },
    { label: "Sent today", value: sentToday, hint: "Across all campaigns" },
    { label: "Replies today", value: repliesToday, hint: "Inbox" },
    {
      label: "Cap remaining",
      value: capRemaining,
      hint: "Sum of room under live campaign daily caps",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Today</h1>
          <p className="page-subtitle">
            Your sending day at a glance. Open a campaign for full sequence
            progress.
          </p>
        </div>
        <div className="flex gap-2">
          {unreadReplies > 0 && (
            <Link href="/inbox?unread=1" className="btn-secondary">
              {unreadReplies} unread
            </Link>
          )}
          <Link href="/campaigns" className="btn-primary">
            Campaigns
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="surface-card px-5 py-5">
            <p className="section-label">{card.label}</p>
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums text-ink">
              {card.value}
            </p>
            <p className="mt-1.5 text-xs text-ink-mute">{card.hint}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink">
          Active & paused campaigns
        </h2>
        <div className="table-shell">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-ink-mute">
              <tr>
                <th className="px-4 py-3.5 font-medium">Campaign</th>
                <th className="px-4 py-3.5 font-medium">Leads</th>
                <th className="px-4 py-3.5 font-medium">Progress</th>
                <th className="px-4 py-3.5 font-medium">Today</th>
                <th className="px-4 py-3.5 font-medium">Daily cap</th>
                <th className="px-4 py-3.5 font-medium">Status</th>
                <th className="px-4 py-3.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeCampaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-ink-mute"
                  >
                    No live campaigns.{" "}
                    <Link href="/campaigns/new" className="text-ink underline">
                      Create one
                    </Link>
                  </td>
                </tr>
              ) : (
                activeCampaigns.map((c) => {
                  const total = c._count.campaignLeads;
                  const done = c.campaignLeads.filter(
                    (cl) =>
                      cl.status === CampaignLeadStatus.COMPLETED ||
                      cl.status === CampaignLeadStatus.REPLIED ||
                      (c._count.steps > 0 &&
                        cl.currentStep >= c._count.steps)
                  ).length;
                  const pct =
                    total === 0 ? 0 : Math.round((done / total) * 100);
                  const used = sentMap.get(c.id) ?? 0;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-line/70 transition hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                        {total}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums text-ink-mute">
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                        {used}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                        {c.dailyCap ?? 45}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`chip ${campaignStatusChipClass(c.status)}`}
                        >
                          {campaignStatusLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <CampaignPauseResume
                          campaignId={c.id}
                          status={c.status}
                          leadCount={total}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
