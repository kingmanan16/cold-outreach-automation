import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "session";
export const SESSION_USER_PREFIX = "u:";
export const SESSION_OPERATOR_PREFIX = "op:";
/** Session lifetime: 7 days */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

function sessionSecret(): string {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.APP_PASSWORD;
  if (!secret) {
    throw new Error("SESSION_SECRET, ENCRYPTION_KEY, or APP_PASSWORD must be set");
  }
  return secret;
}

function hmacHex(message: string): string {
  return createHmac("sha256", sessionSecret()).update(message).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function expiryUnix(maxAgeSec = SESSION_MAX_AGE_SEC): number {
  return Math.floor(Date.now() / 1000) + maxAgeSec;
}

export function getOperatorSessionToken(
  maxAgeSec = SESSION_MAX_AGE_SEC
): string {
  const exp = expiryUnix(maxAgeSec);
  const sig = hmacHex(`cold-outreach-session:${exp}`);
  return `${SESSION_OPERATOR_PREFIX}${exp}.${sig}`;
}

/** @deprecated use getOperatorSessionToken — kept for older imports */
export function getSessionToken(): string {
  return getOperatorSessionToken();
}

export function getUserSessionToken(
  userId: string,
  maxAgeSec = SESSION_MAX_AGE_SEC
): string {
  const exp = expiryUnix(maxAgeSec);
  const sig = hmacHex(`cold-outreach-user:${userId}:${exp}`);
  return `${SESSION_USER_PREFIX}${userId}.${exp}.${sig}`;
}

export function parseOperatorSessionToken(
  token: string | undefined
): boolean {
  if (!token?.startsWith(SESSION_OPERATOR_PREFIX)) return false;
  const rest = token.slice(SESSION_OPERATOR_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot <= 0) return false;
  const expStr = rest.slice(0, dot);
  const sig = rest.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = hmacHex(`cold-outreach-session:${exp}`);
  return safeEqualHex(sig, expected);
}

export function parseUserSessionToken(
  token: string | undefined
): string | null {
  if (!token?.startsWith(SESSION_USER_PREFIX)) return null;
  const rest = token.slice(SESSION_USER_PREFIX.length);
  const parts = rest.split(".");
  // New format: userId.exp.sig
  if (parts.length === 3) {
    const [userId, expStr, sig] = parts;
    if (!userId || !expStr || !sig) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const expected = hmacHex(`cold-outreach-user:${userId}:${exp}`);
    if (!safeEqualHex(sig, expected)) return null;
    return userId;
  }
  return null;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  try {
    if (parseOperatorSessionToken(token)) return true;
    return parseUserSessionToken(token) !== null;
  } catch {
    return false;
  }
}
