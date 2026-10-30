import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const list = await prisma.leadList.findUnique({
    where: { id: params.id },
    include: { _count: { select: { leads: true } } },
  });

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const leads = await tx.lead.findMany({
      where: { listId: params.id },
      select: { id: true },
    });
    const leadIds = leads.map((l) => l.id);

    if (leadIds.length > 0) {
      await tx.campaignLead.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.sentEmail.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.reply.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.lead.deleteMany({ where: { listId: params.id } });
    }

    await tx.leadList.delete({ where: { id: params.id } });
  });

  return NextResponse.json({
    ok: true,
    deletedLeads: list._count.leads,
  });
}
