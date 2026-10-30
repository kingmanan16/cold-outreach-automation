import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkEmailContent } from "@/lib/spam-check";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const account = await prisma.emailAccount.findUnique({
    where: { id: params.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const subject = String(body.subject ?? "Placement test");
  const text = String(body.body ?? "Inbox placement probe from Cold Outreach");
  const spam = checkEmailContent(subject, text);

  // Seed providers simulation — Instantly-style score from content + DNS
  let score = 70;
  if (account.spfOk) score += 10;
  if (account.dmarcOk) score += 10;
  score -= spam.warnings.length * 5;
  score = Math.max(0, Math.min(100, score));
  const result = score >= 75 ? "inbox" : score >= 50 ? "promotions" : "spam";

  const row = await prisma.placementTest.create({
    data: {
      accountId: account.id,
      provider: "heuristic",
      result,
      score,
      raw: { spam, spfOk: account.spfOk, dmarcOk: account.dmarcOk },
    },
  });

  return NextResponse.json(row);
}
