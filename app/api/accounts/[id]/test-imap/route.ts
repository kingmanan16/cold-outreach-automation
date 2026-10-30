import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const account = await prisma.emailAccount.findUnique({
    where: { id: params.id },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapPort === 993,
    auth: {
      user: account.imapUser,
      pass: decrypt(account.imapPassEnc),
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.logout();
    return NextResponse.json({ ok: true, message: "IMAP connection successful" });
  } catch (err) {
    try {
      client.close();
    } catch {
      // ignore cleanup errors
    }
    const message = err instanceof Error ? err.message : "IMAP connection failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
