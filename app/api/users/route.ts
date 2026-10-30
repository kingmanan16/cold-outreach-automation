import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, workspaceId: true },
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const requestedRole = (body.role as UserRole) || UserRole.MEMBER;

  if (!email.includes("@") || password.length < 8) {
    return NextResponse.json(
      { error: "email and password (8+) required" },
      { status: 400 }
    );
  }

  if (requestedRole === UserRole.OWNER) {
    return NextResponse.json(
      { error: "Cannot create OWNER via API" },
      { status: 403 }
    );
  }

  let role: UserRole = UserRole.MEMBER;
  if (requestedRole === UserRole.ADMIN) {
    const canCreateAdmin =
      auth.kind === "operator" || auth.role === UserRole.OWNER;
    if (!canCreateAdmin) {
      return NextResponse.json(
        { error: "Only OWNER/operator can create ADMIN users" },
        { status: 403 }
      );
    }
    role = UserRole.ADMIN;
  } else if (requestedRole !== UserRole.MEMBER) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name ? String(body.name) : null,
      passwordHash: hashPassword(password),
      role,
      workspaceId: body.workspaceId ? String(body.workspaceId) : null,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: auth.kind === "user" ? auth.userId : null,
      action: "user_created",
      meta: { email, role, by: auth.kind },
    },
  });
  return NextResponse.json({
    id: user.id,
    email: user.email,
    role: user.role,
  });
}
