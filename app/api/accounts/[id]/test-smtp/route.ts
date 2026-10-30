import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isGoogleOAuthAccount, getGoogleAccessToken } from "@/lib/gmail-oauth";
import { createSmtpTransport } from "@/lib/smtp-transport";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const account = await prisma.emailAccount.findUnique({
    where: { id: params.id },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    if (isGoogleOAuthAccount(account)) {
      await getGoogleAccessToken(account);
      return NextResponse.json({
        ok: true,
        via: "gmail-api",
        message: "Google OAuth token OK — Gmail API ready (Railway-safe)",
      });
    }

    const transporter = createSmtpTransport(account);
    await transporter.verify();
    return NextResponse.json({
      ok: true,
      via: "smtp",
      message:
        "SMTP connection successful (local only — Railway Hobby blocks SMTP; connect Google OAuth)",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Connection test failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
