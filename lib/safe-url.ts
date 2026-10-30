import { isIP } from "net";

/**
 * Allow only public https (or http for localhost in development) destinations.
 * Blocks private/link-local/metadata hosts to reduce SSRF risk.
 */
export function assertSafeOutboundUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const protocol = url.protocol.toLowerCase();
  const isDev = process.env.NODE_ENV !== "production";
  if (protocol !== "https:" && !(isDev && protocol === "http:")) {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return isDev ? url.toString() : null;
  }

  if (host === "metadata.google.internal" || host.endsWith(".internal")) {
    return null;
  }

  const ipVersion = isIP(host);
  if (ipVersion) {
    if (isPrivateOrReservedIp(host)) return null;
    return url.toString();
  }

  // Block obvious internal DNS names
  if (
    host.endsWith(".local") ||
    host.endsWith(".lan") ||
    host.endsWith(".home")
  ) {
    return null;
  }

  return url.toString();
}

/** Slack incoming webhooks only */
export function assertSafeSlackWebhookUrl(raw: string): string | null {
  const safe = assertSafeOutboundUrl(raw);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "hooks.slack.com") return null;
    if (!url.pathname.startsWith("/services/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateOrReservedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA
    if (normalized.startsWith("fe80")) return true; // link-local
    return false;
  }
  return true;
}
