import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthError, requireAdmin, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const account = await prisma.emailAccount.findUnique({
    where: { id: params.id },
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
      smtpPassEnc: true,
      imapPassEnc: true,
      _count: { select: { sentEmails: true } },
    },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: account.id,
    email: account.email,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecure: account.smtpSecure,
    smtpUser: account.smtpUser,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapUser: account.imapUser,
    dailyLimit: account.dailyLimit,
    sentToday: account.sentToday,
    isWarmedUp: account.isWarmedUp,
    credentialsConfigured: Boolean(account.smtpPassEnc && account.imapPassEnc),
    sentEmailCount: account._count.sentEmails,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const existing = await prisma.emailAccount.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const body = await request.json();
  const data: Prisma.EmailAccountUpdateInput = {};

  if (body.email !== undefined) data.email = String(body.email).trim();
  if (body.smtpHost !== undefined) data.smtpHost = String(body.smtpHost).trim();
  if (body.smtpPort !== undefined) data.smtpPort = Number(body.smtpPort);
  if (body.smtpSecure !== undefined) data.smtpSecure = Boolean(body.smtpSecure);
  if (body.smtpUser !== undefined) data.smtpUser = String(body.smtpUser).trim();
  if (body.imapHost !== undefined) data.imapHost = String(body.imapHost).trim();
  if (body.imapPort !== undefined) data.imapPort = Number(body.imapPort);
  if (body.imapUser !== undefined) data.imapUser = String(body.imapUser).trim();
  if (body.dailyLimit !== undefined) data.dailyLimit = Number(body.dailyLimit);
  if (body.isWarmedUp !== undefined) data.isWarmedUp = Boolean(body.isWarmedUp);
  if (body.warmupEnabled !== undefined) data.warmupEnabled = Boolean(body.warmupEnabled);
  if (body.disabled !== undefined) data.disabled = Boolean(body.disabled);
  if (body.displayName !== undefined) data.displayName = String(body.displayName);

  const smtpPass = body.smtpPass != null ? String(body.smtpPass) : "";
  const imapPass = body.imapPass != null ? String(body.imapPass) : "";

  if (smtpPass.trim()) {
    data.smtpPassEnc = encrypt(smtpPass);
  }
  if (imapPass.trim()) {
    data.imapPassEnc = encrypt(imapPass);
  }

  const account = await prisma.emailAccount.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      email: true,
      dailyLimit: true,
      isWarmedUp: true,
    },
  });

  return NextResponse.json(account);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const existing = await prisma.emailAccount.findUnique({
    where: { id: params.id },
    include: { _count: { select: { sentEmails: true, replies: true } } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.reply.deleteMany({ where: { accountId: params.id } });
    await tx.sentEmail.deleteMany({ where: { accountId: params.id } });
    await tx.emailAccount.delete({ where: { id: params.id } });
  });

  return NextResponse.json({
    ok: true,
    deletedSentEmails: existing._count.sentEmails,
  });
}
