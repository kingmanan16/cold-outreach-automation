import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  campaignStatusChipClass,
  campaignStatusLabel,
} from "@/lib/sequence-labels";

export default async function CampaignsPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { steps: true, campaignLeads: true } },
    },
  });

  const sentToday = await prisma.sentEmail.groupBy({
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
    sentToday.map((r) => [r.campaignId!, r._count._all])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">
            Each campaign is a sequence (e.g. Mail 1 + 3 follow-ups) with its own
            daily pace.
          </p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          New campaign
        </Link>
      </div>

      <div className="table-shell">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/80 text-ink-mute">
            <tr>
              <th className="px-4 py-3.5 font-medium">Name</th>
              <th className="px-4 py-3.5 font-medium">Status</th>
              <th className="px-4 py-3.5 font-medium">Mails</th>
              <th className="px-4 py-3.5 font-medium">Leads</th>
              <th className="px-4 py-3.5 font-medium">Today</th>
              <th className="px-4 py-3.5 font-medium">Daily cap</th>
              <th className="px-4 py-3.5 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-mute">
                  No campaigns yet.{" "}
                  <Link href="/campaigns/new" className="text-ink underline">
                    Create one
                  </Link>{" "}
                  and use the standard 4-mail sequence.
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="border-t border-line/70 transition hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`chip ${campaignStatusChipClass(campaign.status)}`}
                    >
                      {campaignStatusLabel(campaign.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                    {campaign._count.steps}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                    {campaign._count.campaignLeads}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                    {sentMap.get(campaign.id) ?? 0}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                    {campaign.dailyCap ?? 45}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-ink-soft">
                    {campaign.sendGapSec ?? 90}s
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
