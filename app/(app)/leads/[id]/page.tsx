import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/lib/lead-status";
import { LeadStatusSelect } from "@/components/LeadStatusSelect";
import { LeadNotes } from "@/components/LeadNotes";
import { LeadReminder } from "@/components/LeadReminder";
import { formatRelativeTime } from "@/lib/date-range";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      list: true,
      notes: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
      sentEmails: { orderBy: { sentAt: "desc" }, take: 50 },
      replies: { orderBy: { receivedAt: "desc" }, take: 50 },
    },
  });

  if (!lead) notFound();

  const customFields =
    lead.customFields &&
    typeof lead.customFields === "object" &&
    !Array.isArray(lead.customFields)
      ? (lead.customFields as Record<string, unknown>)
      : null;

  type TimelineItem = { at: Date; label: string; detail?: string };
  const timeline: TimelineItem[] = [];

  for (const e of lead.events) {
    timeline.push({
      at: e.createdAt,
      label: e.type,
      detail: e.meta ? JSON.stringify(e.meta) : undefined,
    });
  }
  for (const s of lead.sentEmails) {
    timeline.push({
      at: s.sentAt,
      label: s.bounced
        ? "bounced"
        : s.isManualReply
          ? "manual_reply"
          : "sent",
      detail: `${s.subject}${s.opened ? " · opened" : ""}${s.clicked ? " · clicked" : ""}`,
    });
  }
  for (const r of lead.replies) {
    timeline.push({
      at: r.receivedAt,
      label: "reply",
      detail: r.snippet ?? undefined,
    });
  }
  for (const n of lead.notes) {
    timeline.push({ at: n.createdAt, label: "note", detail: n.content });
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/leads?list=${lead.listId}`}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to {lead.list.name}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">{lead.email}</h1>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Details
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" value={lead.email} />
          <Field label="First name" value={lead.firstName} />
          <Field label="Last name" value={lead.lastName} />
          <Field label="Company" value={lead.company} />
          <Field label="List" value={lead.list.name} />
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Status
            </dt>
            <dd className="mt-1.5">
              <LeadStatusSelect leadId={lead.id} currentStatus={lead.status} />
            </dd>
          </div>
          <LeadReminder leadId={lead.id} reminderAt={lead.reminderAt} />
        </dl>
        {customFields && Object.keys(customFields).length > 0 && (
          <div className="mt-6 border-t border-zinc-100 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-zinc-900">Custom fields</h3>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(customFields).map(([key, value]) => (
                <Field key={key} label={key} value={String(value ?? "")} />
              ))}
            </dl>
          </div>
        )}
      </section>

      <LeadNotes leadId={lead.id} notes={lead.notes} />

      <section className="rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Activity
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((item, i) => (
              <li key={`${item.at.toISOString()}-${i}`} className="text-sm">
                <p className="font-medium text-zinc-900">{item.label}</p>
                {item.detail && (
                  <p className="text-zinc-600 line-clamp-2">{item.detail}</p>
                )}
                <p className="text-xs text-zinc-400">
                  {formatRelativeTime(item.at)} · {item.at.toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim() ?? "";
  const isUrl = /^https?:\/\//i.test(text);
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-zinc-900">
        {!text ? (
          "—"
        ) : isUrl ? (
          <a
            href={text}
            target="_blank"
            rel="noreferrer"
            className="text-teal-800 underline decoration-teal-300/70 underline-offset-2 hover:text-teal-950"
          >
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}
