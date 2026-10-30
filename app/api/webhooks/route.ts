import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSafeOutboundUrl } from "@/lib/safe-url";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const webhooks = await prisma.webhookEndpoint.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ webhooks });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const rawUrl = String(body.url ?? "").trim();
  const url = assertSafeOutboundUrl(rawUrl);
  if (!url) {
    return NextResponse.json(
      {
        error:
          "url must be a public https endpoint (private/local addresses blocked)",
      },
      { status: 400 }
    );
  }
  const row = await prisma.webhookEndpoint.create({
    data: {
      url,
      events: body.events ?? ["*"],
      active: true,
    },
  });
  return NextResponse.json(row);
}
