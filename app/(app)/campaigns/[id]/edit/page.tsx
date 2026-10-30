import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CampaignStepBuilder } from "@/components/CampaignStepBuilder";
import { AttachLeadList } from "@/components/AttachLeadList";

function asCustomFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

export default async function CampaignEditPage({
  params,
}: {
  params: { id: string };
}) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { stepOrder: "asc" } },
      _count: { select: { campaignLeads: true } },
    },
  });

  if (!campaign) {
    notFound();
  }

  const [sampleLead, lists, recentLeads] = await Promise.all([
    prisma.lead.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.leadList.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } },
    }),
    prisma.lead.findMany({
      select: { customFields: true },
      take: 80,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const mergedCustom: Record<string, string> = {};
  for (const row of recentLeads) {
    for (const [k, v] of Object.entries(asCustomFields(row.customFields))) {
      if (!(k in mergedCustom)) mergedCustom[k] = v || `Sample ${k}`;
    }
  }
  Object.assign(mergedCustom, asCustomFields(sampleLead?.customFields));

  const previewLead = {
    email: sampleLead?.email ?? "alex@example.com",
    firstName: sampleLead?.firstName ?? "Alex",
    lastName: sampleLead?.lastName ?? "Example",
    company: sampleLead?.company ?? "Example Co",
    customFields: mergedCustom,
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/campaigns/${campaign.id}`}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to campaign
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
            Edit: {campaign.name}
          </h1>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Steps</h2>
        <CampaignStepBuilder
          campaignId={campaign.id}
          initialSteps={campaign.steps.map((s) => ({
            subject: s.subject,
            subjectB: s.subjectB ?? "",
            body: s.body,
            bodyB: s.bodyB ?? "",
            delayDays: s.delayDays,
            winner: s.winner ?? "",
          }))}
          sampleLead={previewLead}
          hasAttachedLeads={campaign._count.campaignLeads > 0}
          attachedLeadCount={campaign._count.campaignLeads}
          threadFollowUps={campaign.threadFollowUps}
        />
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Attach lead list</h2>
        <AttachLeadList
          campaignId={campaign.id}
          lists={lists.map((l) => ({
            id: l.id,
            name: l.name,
            leadCount: l._count.leads,
          }))}
        />
      </section>
    </div>
  );
}
