import { NextResponse } from "next/server";
import { CampaignLeadStatus, LeadStatus } from "@prisma/client";
import { isAdminAuth, isAuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordLeadEvent } from "@/lib/lead-events";
import { shouldStopSequenceOnStatus } from "@/lib/lead-sending";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const action = String(body.action ?? "");
  if (!ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  if (action === "delete" || action === "suppress") {
    if (!isAdminAuth(auth)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (action === "status") {
    const status = body.status as LeadStatus;
    if (!Object.values(LeadStatus).includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    if (shouldStopSequenceOnStatus(status)) {
      await prisma.campaignLead.updateMany({
        where: { leadId: { in: ids }, status: CampaignLeadStatus.ACTIVE },
        data: { status: CampaignLeadStatus.STOPPED, nextSendAt: null },
      });
    }
    for (const id of ids) {
      await recordLeadEvent(id, "status_bulk", { status });
    }
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  if (action === "move-list") {
    const listId = String(body.listId ?? "");
    if (!listId) {
      return NextResponse.json({ error: "listId required" }, { status: 400 });
    }
    await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { listId },
    });
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  if (action === "suppress") {
    const leads = await prisma.lead.findMany({ where: { id: { in: ids } } });
    for (const lead of leads) {
      await prisma.suppression.upsert({
        where: { email: lead.email.toLowerCase() },
        create: {
          email: lead.email.toLowerCase(),
          reason: String(body.reason ?? "bulk suppress"),
        },
        update: { reason: String(body.reason ?? "bulk suppress") },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.UNSUBSCRIBED },
      });
    }
    return NextResponse.json({ ok: true, suppressed: leads.length });
  }

  if (action === "delete") {
    await prisma.note.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.leadEvent.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.reply.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.sentEmail.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.campaignLead.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ ok: true, deleted: ids.length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
