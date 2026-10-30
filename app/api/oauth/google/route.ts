import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { getGoogleOAuthRedirectUri } from "@/lib/google-oauth-redirect";

const OAUTH_STATE_COOKIE = "oauth_google_state";

/**
 * Start Google OAuth. Requires GOOGLE_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirect = getGoogleOAuthRedirectUri(request);
  if (!clientId) {
    return NextResponse.redirect(
      new URL(
        "/accounts?oauth=missing",
        process.env.APP_URL || request.url
      )
    );
  }

  const state = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email"
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return res;
}

/**
 * Manual token paste — stores OAuth tokens and uses XOAUTH2 (not as SMTP password).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const accessToken = String(body.accessToken ?? "");
  const refreshToken = String(body.refreshToken ?? "");
  if (!email || !accessToken) {
    return NextResponse.json(
      { error: "email and accessToken required" },
      { status: 400 }
    );
  }

  const existing = await prisma.emailAccount.findUnique({ where: { email } });
  const placeholderPass = existing?.smtpPassEnc ?? encrypt(`oauth:${email}`);

  const account = await prisma.emailAccount.upsert({
    where: { email },
    create: {
      email,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: email,
      smtpPassEnc: placeholderPass,
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapUser: email,
      imapPassEnc: placeholderPass,
      oauthProvider: "google",
      oauthAccessEnc: encrypt(accessToken),
      oauthRefreshEnc: refreshToken ? encrypt(refreshToken) : null,
      dailyLimit: 20,
    },
    update: {
      oauthProvider: "google",
      oauthAccessEnc: encrypt(accessToken),
      oauthRefreshEnc: refreshToken ? encrypt(refreshToken) : null,
    },
  });

  return NextResponse.json({ id: account.id, email: account.email, oauth: true });
}
