function strip(value: string): string {
  return value.trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "");
}

/**
 * Must match Google Cloud "Authorized redirect URIs" exactly,
 * and must be the same string in /authorize and /token exchange.
 */
export function getGoogleOAuthRedirectUri(request: Request): string {
  const onVercel = Boolean(process.env.VERCEL);

  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit?.trim()) {
    const raw = strip(explicit);
    const uri = raw.includes("/api/oauth/google/callback")
      ? raw
      : `${raw}/api/oauth/google/callback`;
    if (!(onVercel && uri.includes("localhost"))) {
      return uri;
    }
  }

  let appUrl = process.env.APP_URL ? strip(process.env.APP_URL) : "";
  if (onVercel && appUrl.includes("localhost")) {
    appUrl = "";
  }
  if (appUrl) {
    return `${appUrl}/api/oauth/google/callback`;
  }

  const hostHeader =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    new URL(request.url).host;
  const host = hostHeader.split(",")[0]?.trim() || "djasxglobal.vercel.app";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (onVercel ? "https" : new URL(request.url).protocol.replace(":", "")) ||
    "https";
  return `${proto}://${host}/api/oauth/google/callback`;
}
