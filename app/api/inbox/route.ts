import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "";
  const unread = searchParams.get("unread") === "1";
  const accountId = searchParams.get("accountId") ?? "";
  const campaignId = searchParams.get("campaignId") ?? "";

  const where: Prisma.ReplyWhereInput = {};
  if (unread) where.readAt = null;
  if (category) where.category = category;
  if (accountId) where.accountId = accountId;
  if (campaignId) {
    where.lead = { sentEmails: { some: { campaignId } } };
  }
  if (q) {
    where.OR = [
      { snippet: { contains: q, mode: "insensitive" } },
      { body: { contains: q, mode: "insensitive" } },
      { lead: { email: { contains: q, mode: "insensitive" } } },
      { lead: { firstName: { contains: q, mode: "insensitive" } } },
      { lead: { company: { contains: q, mode: "insensitive" } } },
    ];
  }

  const replies = await prisma.reply.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: { lead: true, account: true },
  });

  return NextResponse.json({ replies });
}
