import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PipelineBoard } from "@/components/PipelineBoard";

const COLUMNS: LeadStatus[] = [
  LeadStatus.INTERESTED,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
];

export default async function PipelinePage() {
  const leads = await prisma.lead.findMany({
    where: { status: { in: COLUMNS } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Pipeline</h1>
      <p className="text-sm text-zinc-500">
        Drag interested leads through negotiation to won/lost.
      </p>
      <PipelineBoard
        initial={leads.map((l) => ({
          id: l.id,
          email: l.email,
          name: [l.firstName, l.lastName].filter(Boolean).join(" "),
          company: l.company,
          status: l.status,
        }))}
      />
    </div>
  );
}
