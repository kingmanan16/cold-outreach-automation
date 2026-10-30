import { NextResponse } from "next/server";
import { CampaignStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const EDITABLE_STATUSES = new Set<CampaignStatus>([
  CampaignStatus.DRAFT,
  CampaignStatus.ACTIVE,
  CampaignStatus.PAUSED,
]);

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { stepOrder: "asc" } },
      campaignLeads: {
        include: { lead: true },
        orderBy: { id: "asc" },
      },
      _count: { select: { campaignLeads: true } },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.campaign.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json();
  const data: Prisma.CampaignUpdateInput = {};

  if (body.name !== undefined) {
    data.name = String(body.name).trim();
  }

  if (body.status !== undefined) {
    const status = body.status as CampaignStatus;
    if (!EDITABLE_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = status;
    // Manual status changes clear kill-switch tracking
    data.pausedByKillSwitch = false;
  }

  if (body.timezone !== undefined) data.timezone = String(body.timezone);
  if (body.scheduledStartAt !== undefined) {
    data.scheduledStartAt = body.scheduledStartAt
      ? new Date(String(body.scheduledStartAt))
      : null;
  }
  if (body.sendWindowStartMin !== undefined) {
    data.sendWindowStartMin = Number(body.sendWindowStartMin);
  }
  if (body.sendWindowEndMin !== undefined) {
    data.sendWindowEndMin = Number(body.sendWindowEndMin);
  }
  if (body.sendDays !== undefined) {
    data.sendDays = body.sendDays;
  }
  if (body.dailyCap !== undefined) {
    const cap = Number(body.dailyCap);
    if (!Number.isFinite(cap) || cap < 1 || cap > 10000) {
      return NextResponse.json(
        { error: "dailyCap must be between 1 and 10000" },
        { status: 400 }
      );
    }
    data.dailyCap = Math.floor(cap);
  }
  if (body.sendGapSec !== undefined) {
    const gap = Number(body.sendGapSec);
    if (!Number.isFinite(gap) || gap < 15 || gap > 600) {
      return NextResponse.json(
        { error: "sendGapSec must be between 15 and 600" },
        { status: 400 }
      );
    }
    data.sendGapSec = Math.floor(gap);
  }
  if (body.maxPerTick !== undefined) {
    const n = Number(body.maxPerTick);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return NextResponse.json(
        { error: "maxPerTick must be between 1 and 50" },
        { status: 400 }
      );
    }
    data.maxPerTick = Math.floor(n);
  }
  if (body.threadFollowUps !== undefined) {
    data.threadFollowUps = Boolean(body.threadFollowUps);
  }
  if (body.accountIds !== undefined && Array.isArray(body.accountIds)) {
    await prisma.campaignAccount.deleteMany({ where: { campaignId: params.id } });
    const ids = body.accountIds.map(String).filter(Boolean);
    if (ids.length) {
      await prisma.campaignAccount.createMany({
        data: ids.map((accountId: string) => ({
          campaignId: params.id,
          accountId,
        })),
        skipDuplicates: true,
      });
    }
  }

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data,
    include: { campaignAccounts: true },
  });

  return NextResponse.json(campaign);
}
