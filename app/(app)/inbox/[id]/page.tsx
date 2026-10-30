import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReplyCategorySelect } from "@/components/ReplyCategorySelect";

export default async function ReplyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const reply = await prisma.reply.findUnique({
    where: { id: params.id },
    include: {
      lead: true,
      account: true,
    },
  });

  if (!reply) {
    notFound();
  }

  const sent = await prisma.sentEmail.findFirst({
    where: { leadId: reply.leadId },
    orderBy: { sentAt: "desc" },
  });

  const campaign = sent?.campaignId
    ? await prisma.campaign.findUnique({
        where: { id: sent.campaignId },
        include: {
          steps: { orderBy: { stepOrder: "asc" } },
        },
      })
    : null;

  const step =
    campaign && sent?.stepOrder != null
      ? campaign.steps.find((s) => s.stepOrder === sent.stepOrder)
      : null;

  const name = [reply.lead.firstName, reply.lead.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/inbox" className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Back to inbox
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          {name || reply.lead.email}
        </h1>
        <p className="text-sm text-zinc-500">{reply.lead.email}</p>
      </div>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Received {reply.receivedAt.toLocaleString()}
          </p>
          <ReplyCategorySelect replyId={reply.id} current={reply.category} />
        </div>
        <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800">
          {reply.body || reply.snippet || "(empty body)"}
        </pre>
      </section>

      <section className="rounded-md border border-zinc-200 bg-zinc-50 p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Original outreach
        </h2>
        {campaign && step ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Campaign
              </dt>
              <dd className="mt-1">
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  {campaign.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Step
              </dt>
              <dd className="mt-1 text-zinc-900">
                Step {(sent?.stepOrder ?? 0) + 1}: {step.subject}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Via account
              </dt>
              <dd className="mt-1 text-zinc-900">{reply.account.email}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-zinc-500">
            Could not determine the original campaign/step for this reply.
          </p>
        )}
      </section>
    </div>
  );
}
