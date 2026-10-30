import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";
import {
  getOperatorSessionToken,
  getUserSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
} from "@/lib/session";

async function readCredentials(request: Request): Promise<{
  email: string;
  password: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return {
      email: String(body.email ?? "").trim().toLowerCase(),
      password: String(body.password ?? ""),
    };
  }
  const formData = await request.formData();
  return {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

function fail(
  request: Request,
  wantsJson: boolean,
  status: number,
  error: string,
  retryAfterSec?: number
) {
  if (wantsJson) {
    const res = NextResponse.json({ error }, { status });
    if (retryAfterSec) res.headers.set("Retry-After", String(retryAfterSec));
    return res;
  }
  const url = new URL("/login?error=1", request.url);
  const res = NextResponse.redirect(url);
  if (retryAfterSec) res.headers.set("Retry-After", String(retryAfterSec));
  return res;
}

export async function POST(request: Request) {
  if (!process.env.APP_PASSWORD) {
    return NextResponse.json(
      { error: "APP_PASSWORD is not configured" },
      { status: 500 }
    );
  }

  const wantsJson = (request.headers.get("content-type") ?? "").includes(
    "application/json"
  );
  const ip = clientIpFromRequest(request);
  const limited = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!limited.ok) {
    return fail(
      request,
      wantsJson,
      429,
      "Too many login attempts. Try again later.",
      limited.retryAfterSec
    );
  }

  const { email, password } = await readCredentials(request);

  // Operator shared password (no email required)
  if (!email && password === process.env.APP_PASSWORD) {
    if (wantsJson) {
      const res = NextResponse.json({ ok: true, role: "operator" });
      setSessionCookie(res, getOperatorSessionToken());
      return res;
    }
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    setSessionCookie(response, getOperatorSessionToken());
    return response;
  }

  // Team user: email + password — do NOT accept APP_PASSWORD with arbitrary email
  if (email && password) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && verifyPassword(password, user.passwordHash)) {
      if (wantsJson) {
        const res = NextResponse.json({
          ok: true,
          role: user.role,
          userId: user.id,
        });
        setSessionCookie(res, getUserSessionToken(user.id));
        return res;
      }
      const response = NextResponse.redirect(new URL("/dashboard", request.url));
      setSessionCookie(response, getUserSessionToken(user.id));
      return response;
    }
  }

  return fail(request, wantsJson, 401, "Invalid credentials");
}
