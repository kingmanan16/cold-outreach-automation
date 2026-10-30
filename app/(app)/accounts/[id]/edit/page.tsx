import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EditAccountForm } from "@/components/EditAccountForm";

export default async function EditAccountPage({
  params,
}: {
  params: { id: string };
}) {
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
      isWarmedUp: true,
      smtpPassEnc: true,
      imapPassEnc: true,
    },
  });

  if (!account) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Edit account</h1>
        <Link href="/accounts" className="text-sm text-zinc-600 hover:text-zinc-900">
          Back to accounts
        </Link>
      </div>

      <EditAccountForm
        account={{
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
          isWarmedUp: account.isWarmedUp,
          credentialsConfigured: Boolean(
            account.smtpPassEnc && account.imapPassEnc
          ),
        }}
      />
    </div>
  );
}
