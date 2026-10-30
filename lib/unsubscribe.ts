import { createHmac, timingSafeEqual } from "crypto";

function getSecret(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.APP_PASSWORD;
  if (!key) throw new Error("ENCRYPTION_KEY or APP_PASSWORD required for unsubscribe tokens");
  return key;
}

export function signUnsubscribeToken(leadId: string): string {
  const sig = createHmac("sha256", getSecret()).update(leadId).digest("base64url");
  return `${leadId}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [leadId, sig] = parts;
  if (!leadId || !sig) return null;

  const expected = createHmac("sha256", getSecret())
    .update(leadId)
    .digest("base64url");

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return leadId;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(leadId: string): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/unsubscribe/${signUnsubscribeToken(leadId)}`;
}

export function appendUnsubscribeFooter(body: string, leadId: string): string {
  const url = buildUnsubscribeUrl(leadId);
  return `${body.trim()}\n\n---\nIf you prefer not to receive these emails, unsubscribe here:\n${url}`;
}
