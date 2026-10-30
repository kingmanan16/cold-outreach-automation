import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      list: { select: { id: true, name: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 20 },
      events: { orderBy: { createdAt: "desc" }, take: 40 },
      sentEmails: {
        orderBy: { sentAt: "desc" },
        take: 20,
        select: {
          id: true,
          subject: true,
          sentAt: true,
          opened: true,
          clicked: true,
          bounced: true,
          isManualReply: true,
        },
      },
      replies: {
        orderBy: { receivedAt: "desc" },
        take: 20,
        select: {
          id: true,
          receivedAt: true,
          snippet: true,
          category: true,
        },
      },
      campaignLeads: {
        include: {
          campaign: { select: { id: true, name: true, status: true } },
        },
        take: 10,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ lead });
}
