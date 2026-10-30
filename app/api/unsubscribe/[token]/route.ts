import { NextResponse } from "next/server";
import { CampaignLeadStatus, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { recordLeadEvent } from "@/lib/lead-events";

export async function POST(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const leadId = verifyUnsubscribeToken(params.token);
  if (!leadId) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const email = lead.email.toLowerCase();

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { status: LeadStatus.UNSUBSCRIBED },
    });
    await tx.campaignLead.updateMany({
      where: { leadId, status: CampaignLeadStatus.ACTIVE },
      data: { status: CampaignLeadStatus.STOPPED, nextSendAt: null },
    });
    await tx.suppression.upsert({
      where: { email },
      create: { email, reason: "unsubscribe link" },
      update: { reason: "unsubscribe link" },
    });
  });

  await recordLeadEvent(leadId, "unsubscribed", { email });

  return NextResponse.json({ ok: true });
}
