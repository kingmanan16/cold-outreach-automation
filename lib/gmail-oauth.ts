import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

export type OAuthAccount = {
  id: string;
  email: string;
  oauthProvider?: string | null;
  oauthAccessEnc?: string | null;
  oauthRefreshEnc?: string | null;
  oauthExpiry?: Date | null;
};

function oauthConfigured(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not set"
    );
  }
  return { clientId, clientSecret };
}

/** Refresh Google access token and persist on the account row. */
export async function refreshGoogleAccessToken(
  account: OAuthAccount
): Promise<string> {
  if (!account.oauthRefreshEnc) {
    throw new Error(
      `No Google refresh token for ${account.email}. Re-connect Google OAuth with consent.`
    );
  }

  const { clientId, clientSecret } = oauthConfigured();
  const refreshToken = decrypt(account.oauthRefreshEnc);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Google token refresh failed for ${account.email}: ${detail.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const expiry =
    data.expires_in != null
      ? new Date(Date.now() + data.expires_in * 1000)
      : new Date(Date.now() + 3500 * 1000);

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      oauthAccessEnc: encrypt(data.access_token),
      oauthExpiry: expiry,
      oauthProvider: "google",
    },
  });

  return data.access_token;
}

/**
 * Return a usable Google access token, refreshing if expired/missing.
 * Refreshes 60s early.
 */
export async function getGoogleAccessToken(
  account: OAuthAccount
): Promise<string> {
  if (account.oauthProvider !== "google") {
    throw new Error(`${account.email} is not a Google OAuth account`);
  }

  const skewMs = 60_000;
  const stillValid =
    account.oauthAccessEnc &&
    account.oauthExpiry &&
    account.oauthExpiry.getTime() - skewMs > Date.now();

  if (stillValid && account.oauthAccessEnc) {
    return decrypt(account.oauthAccessEnc);
  }

  if (account.oauthRefreshEnc) {
    return refreshGoogleAccessToken(account);
  }

  if (account.oauthAccessEnc) {
    // No refresh token / expiry — try existing access token anyway
    return decrypt(account.oauthAccessEnc);
  }

  throw new Error(
    `Google OAuth not connected for ${account.email}. Open Accounts → Connect Google OAuth.`
  );
}

export function isGoogleOAuthAccount(account: {
  oauthProvider?: string | null;
  oauthAccessEnc?: string | null;
  oauthRefreshEnc?: string | null;
}): boolean {
  return (
    account.oauthProvider === "google" &&
    Boolean(account.oauthAccessEnc || account.oauthRefreshEnc)
  );
}
