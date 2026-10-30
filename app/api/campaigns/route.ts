import { NextResponse } from "next/server";
import { CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { steps: true, campaignLeads: true } },
    },
  });

  return NextResponse.json(
    campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      stepCount: c._count.steps,
      leadCount: c._count.campaignLeads,
      createdAt: c.createdAt,
    }))
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      status: CampaignStatus.DRAFT,
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
