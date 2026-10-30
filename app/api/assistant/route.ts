import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { runAssistantChat, type AssistantTurn } from "@/lib/assistant";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const ip = clientIpFromRequest(request);
  const limited = rateLimit(`assistant:${ip}`, 24, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many requests — retry in ${limited.retryAfterSec}s` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const messages = Array.isArray(body.messages)
    ? (body.messages as AssistantTurn[]).slice(-12)
    : [];
  const campaignId =
    typeof body.campaignId === "string" ? body.campaignId : undefined;

  if (!messages.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const result = await runAssistantChat({ messages, campaignId });

  if (result.ok) {
    return NextResponse.json({
      reply: result.reply,
      snapshot: {
        dueFollowUps: result.snapshot.totals.dueFollowUps,
        dueNewMail: result.snapshot.totals.dueNewMail,
        globalPaused: result.snapshot.globalPaused,
      },
    });
  }

  return NextResponse.json({
    reply: result.fallback ?? "Assistant unavailable.",
    error: result.error,
    degraded: true,
  });
}
