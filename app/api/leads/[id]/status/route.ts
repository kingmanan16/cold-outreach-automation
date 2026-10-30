import { NextResponse } from "next/server";
import { CampaignLeadStatus, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordLeadEvent } from "@/lib/lead-events";
import { shouldStopSequenceOnStatus } from "@/lib/lead-sending";

const VALID_STATUSES = new Set(Object.values(LeadStatus));

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const status = body.status as LeadStatus;

  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const lead = await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id: params.id },
      data: { status },
    });
    if (shouldStopSequenceOnStatus(status)) {
      await tx.campaignLead.updateMany({
        where: { leadId: params.id, status: CampaignLeadStatus.ACTIVE },
        data: { status: CampaignLeadStatus.STOPPED, nextSendAt: null },
      });
    }
    return updated;
  });

  await recordLeadEvent(lead.id, "status_changed", { status });

  return NextResponse.json({ id: lead.id, status: lead.status });
}
