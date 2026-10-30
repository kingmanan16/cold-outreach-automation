import { NextResponse } from "next/server";
import { CampaignLeadStatus, CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clampMaxPerTick } from "@/lib/send-pacing";

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
  if (campaign.status !== CampaignStatus.ACTIVE) {
    return NextResponse.json(
      {
        error: "Campaign must be Active to use Send now",
        status: campaign.status,
      },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const leadIds: string[] | undefined = Array.isArray(body.leadIds)
    ? body.leadIds.map(String)
    : undefined;
  const limit = clampMaxPerTick(
    body.limit ?? campaign.maxPerTick ?? 5
  );

  const now = new Date();

  if (leadIds?.length) {
    const result = await prisma.campaignLead.updateMany({
      where: {
        campaignId: params.id,
        status: CampaignLeadStatus.ACTIVE,
        leadId: { in: leadIds.slice(0, limit) },
      },
      data: {
        nextSendAt: now,
        bypassWindowOnce: true,
      },
    });
    return NextResponse.json({ updated: result.count, limit });
  }

  const due = await prisma.campaignLead.findMany({
    where: {
      campaignId: params.id,
      status: CampaignLeadStatus.ACTIVE,
    },
    orderBy: { nextSendAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const result = await prisma.campaignLead.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: {
      nextSendAt: now,
      bypassWindowOnce: true,
    },
  });

  return NextResponse.json({ updated: result.count, limit });
}
