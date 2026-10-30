import { NextResponse } from "next/server";
import { CampaignLeadStatus, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json();
  const listId = String(body.listId ?? "").trim();
  if (!listId) {
    return NextResponse.json({ error: "listId is required" }, { status: 400 });
  }

  const statuses: LeadStatus[] | undefined = Array.isArray(body.statuses)
    ? body.statuses.filter((s: string) =>
        Object.values(LeadStatus).includes(s as LeadStatus)
      )
    : undefined;
  const search = String(body.search ?? "").trim();
  const limit =
    body.limit != null && Number.isFinite(Number(body.limit))
      ? Math.max(1, Math.min(5000, Number(body.limit)))
      : undefined;
  const excludeSuppressed = body.excludeSuppressed !== false;

  const where: Prisma.LeadWhereInput = { listId };
  if (statuses?.length) where.status = { in: statuses };
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
    ];
  }

  let leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  if (excludeSuppressed) {
    const suppressed = await prisma.suppression.findMany({
      select: { email: true },
    });
    const set = new Set(suppressed.map((s) => s.email.toLowerCase()));
    leads = leads.filter((l) => !set.has(l.email.toLowerCase()));
  }

  const now = new Date();
  let attached = 0;
  let skipped = 0;

  for (const lead of leads) {
    try {
      await prisma.campaignLead.create({
        data: {
          campaignId: params.id,
          leadId: lead.id,
          currentStep: 0,
          status: CampaignLeadStatus.ACTIVE,
          nextSendAt: now,
        },
      });
      attached += 1;
    } catch {
      skipped += 1;
    }
  }

  return NextResponse.json({
    listId,
    attached,
    skipped,
    considered: leads.length,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => ({}));
  // Accept one id or many so the table can remove a selection in one call.
  const ids = Array.isArray(body.leadIds)
    ? body.leadIds.map(String).filter(Boolean)
    : [String(body.leadId ?? "")].filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "leadId or leadIds required" },
      { status: 400 }
    );
  }

  const result = await prisma.campaignLead.deleteMany({
    where: { campaignId: params.id, leadId: { in: ids } },
  });
  return NextResponse.json({ ok: true, removed: result.count });
}
