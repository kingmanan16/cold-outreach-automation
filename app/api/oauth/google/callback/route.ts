import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { getGoogleOAuthRedirectUri } from "@/lib/google-oauth-redirect";

const OAUTH_STATE_COOKIE = "oauth_google_state";

function appBaseUrl(): string {
  const raw = (process.env.APP_URL ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (raw && !raw.includes("localhost")) return raw.replace(/\/+$/, "");
  return "https://djasxglobal.vercel.app";
}

function fail(appUrl: string, reason: string) {
  const res = NextResponse.redirect(
    `${appUrl}/accounts?oauth=error&reason=${encodeURIComponent(reason.slice(0, 160))}`
  );
  res.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET(request: Request) {
  const appUrl = appBaseUrl();
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const err = url.searchParams.get("error");
    const state = url.searchParams.get("state");

    const expectedState = cookies().get(OAUTH_STATE_COOKIE)?.value;
    if (!expectedState || !state || state !== expectedState) {
      return fail(appUrl, "invalid_state");
    }
    if (err || !code) {
      return fail(appUrl, err || "missing_code");
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim().replace(
      /^["']+|["']+$/g,
      ""
    );
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim().replace(
      /^["']+|["']+$/g,
      ""
    );
    const redirect = getGoogleOAuthRedirectUri(request);
    if (!clientId || !clientSecret) {
      return fail(appUrl, "oauth_env_missing");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return fail(appUrl, `token:${detail.slice(0, 100)}`);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!profileRes.ok) {
      return fail(appUrl, "profile");
    }
    const profile = (await profileRes.json()) as { email?: string };
    const email = profile.email?.toLowerCase();
    if (!email) {
      return fail(appUrl, "no_email");
    }

    const existing = await prisma.emailAccount.findUnique({ where: { email } });
    const placeholderPass = existing?.smtpPassEnc ?? encrypt(`oauth:${email}`);
    const expiry =
      tokens.expires_in != null
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

    await prisma.emailAccount.upsert({
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
        oauthAccessEnc: encrypt(tokens.access_token),
        oauthRefreshEnc: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : null,
        oauthExpiry: expiry,
        dailyLimit: 25,
      },
      update: {
        oauthProvider: "google",
        oauthAccessEnc: encrypt(tokens.access_token),
        oauthRefreshEnc: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : undefined,
        oauthExpiry: expiry,
      },
    });

    const res = NextResponse.redirect(`${appUrl}/accounts?oauth=connected`);
    res.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(appUrl, message);
  }
}
