import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  parseOperatorSessionToken,
  parseUserSessionToken,
} from "@/lib/session";

export type AuthContext =
  | { kind: "operator"; role: "operator" }
  | { kind: "user"; userId: string; role: UserRole; email: string };

export function isAdminAuth(auth: AuthContext): boolean {
  if (auth.kind === "operator") return true;
  return auth.role === UserRole.OWNER || auth.role === UserRole.ADMIN;
}

export async function getAuth(): Promise<AuthContext | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  if (parseOperatorSessionToken(token)) {
    return { kind: "operator", role: "operator" };
  }

  const userId = parseUserSessionToken(token);
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });
  if (!user) return null;

  return {
    kind: "user",
    userId: user.id,
    role: user.role,
    email: user.email,
  };
}

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return auth;
}

export async function requireAdmin(): Promise<AuthContext | NextResponse> {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!isAdminAuth(auth)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return auth;
}

export function isAuthError(
  value: AuthContext | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}
