import { NextResponse } from "next/server";
import { isAuthError, requireAdmin, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const accounts = await prisma.emailAccount.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      imapHost: true,
      imapPort: true,
      imapUser: true,
      dailyLimit: true,
      sentToday: true,
      isWarmedUp: true,
      createdAt: true,
      smtpPassEnc: true,
      imapPassEnc: true,
      _count: { select: { sentEmails: true } },
    },
  });

  return NextResponse.json(
    accounts.map((a) => ({
      id: a.id,
      email: a.email,
      smtpHost: a.smtpHost,
      smtpPort: a.smtpPort,
      smtpSecure: a.smtpSecure,
      smtpUser: a.smtpUser,
      imapHost: a.imapHost,
      imapPort: a.imapPort,
      imapUser: a.imapUser,
      dailyLimit: a.dailyLimit,
      sentToday: a.sentToday,
      isWarmedUp: a.isWarmedUp,
      createdAt: a.createdAt,
      credentialsConfigured: Boolean(a.smtpPassEnc && a.imapPassEnc),
      sentEmailCount: a._count.sentEmails,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json();

  const email = String(body.email ?? "").trim();
  const smtpHost = String(body.smtpHost ?? "").trim();
  const smtpPort = Number(body.smtpPort);
  const smtpSecure = Boolean(body.smtpSecure);
  const smtpUser = String(body.smtpUser ?? "").trim();
  const smtpPass = String(body.smtpPass ?? "");
  const imapHost = String(body.imapHost ?? "").trim();
  const imapPort = Number(body.imapPort);
  const imapUser = String(body.imapUser ?? "").trim();
  const imapPass = String(body.imapPass ?? "");
  const dailyLimit = Number(body.dailyLimit ?? 25);

  if (
    !email ||
    !smtpHost ||
    !smtpPort ||
    !smtpUser ||
    !smtpPass ||
    !imapHost ||
    !imapPort ||
    !imapUser ||
    !imapPass
  ) {
    return NextResponse.json(
      { error: "All required fields must be filled" },
      { status: 400 }
    );
  }

  const account = await prisma.emailAccount.create({
    data: {
      email,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPassEnc: encrypt(smtpPass),
      imapHost,
      imapPort,
      imapUser,
      imapPassEnc: encrypt(imapPass),
      dailyLimit: Number.isFinite(dailyLimit) ? dailyLimit : 25,
    },
    select: {
      id: true,
      email: true,
      smtpHost: true,
      dailyLimit: true,
      sentToday: true,
    },
  });

  return NextResponse.json(account, { status: 201 });
}
