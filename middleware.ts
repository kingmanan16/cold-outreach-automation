import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "session";
const SESSION_USER_PREFIX = "u:";
const SESSION_OPERATOR_PREFIX = "op:";

async function isValidSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret =
    process.env.SESSION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    process.env.APP_PASSWORD;
  if (!secret) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  async function hmacHex(message: string) {
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(message)
    );
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i++) {
      out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return out === 0;
  }

  const now = Math.floor(Date.now() / 1000);

  if (token.startsWith(SESSION_OPERATOR_PREFIX)) {
    const rest = token.slice(SESSION_OPERATOR_PREFIX.length);
    const dot = rest.indexOf(".");
    if (dot <= 0) return false;
    const expStr = rest.slice(0, dot);
    const sig = rest.slice(dot + 1);
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < now) return false;
    const expected = await hmacHex(`cold-outreach-session:${exp}`);
    return timingSafeEqualHex(sig, expected);
  }

  if (token.startsWith(SESSION_USER_PREFIX)) {
    const rest = token.slice(SESSION_USER_PREFIX.length);
    const parts = rest.split(".");
    if (parts.length !== 3) return false;
    const [userId, expStr, sig] = parts;
    if (!userId || !expStr || !sig) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < now) return false;
    const expected = await hmacHex(`cold-outreach-user:${userId}:${exp}`);
    return timingSafeEqualHex(sig, expected);
  }

  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/unsubscribe") ||
    pathname.startsWith("/api/unsubscribe") ||
    pathname.startsWith("/api/track") ||
    pathname.startsWith("/api/oauth/google/callback") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await isValidSessionToken(token);

  if (!valid) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
