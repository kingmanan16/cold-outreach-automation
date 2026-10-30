import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { UnsubscribeConfirm } from "@/components/UnsubscribeConfirm";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  params,
}: {
  params: { token: string };
}) {
  const leadId = verifyUnsubscribeToken(params.token);
  if (!leadId) {
    notFound();
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    notFound();
  }

  const already = lead.status === "UNSUBSCRIBED";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-md border border-zinc-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-zinc-900">Unsubscribe</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {already
            ? `${lead.email} is already unsubscribed.`
            : `Confirm you want to unsubscribe ${lead.email} from future emails.`}
        </p>
        {!already && <UnsubscribeConfirm token={params.token} />}
      </div>
    </main>
  );
}
