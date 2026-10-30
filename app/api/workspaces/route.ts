import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const workspaces = await prisma.workspace.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ workspaces });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const ws = await prisma.workspace.create({ data: { name } });
  return NextResponse.json(ws);
}
