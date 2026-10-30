import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkDomainDns } from "@/lib/dns-health";

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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const health = await checkDomainDns(account.email);
  await prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      spfOk: health.spfOk,
      dkimOk: health.dkimOk,
      dmarcOk: health.dmarcOk,
      dnsCheckedAt: new Date(),
    },
  });
  return NextResponse.json(health);
}
