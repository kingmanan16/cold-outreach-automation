import { NextResponse } from "next/server";
import { isAuthError, requireAdmin, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const rows = await prisma.suppression.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ suppressions: rows });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }
  const row = await prisma.suppression.upsert({
    where: { email },
    create: { email, reason: String(body.reason ?? "manual") },
    update: { reason: String(body.reason ?? "manual") },
  });
  return NextResponse.json(row);
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  await prisma.suppression.deleteMany({ where: { email } });
  return NextResponse.json({ ok: true });
}
