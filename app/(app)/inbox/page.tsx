import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatRelativeTime } from "@/lib/date-range";
import { ReplyCategorySelect } from "@/components/ReplyCategorySelect";
import {
  InboxReplyCompose,
  InboxSnoozeButton,
} from "@/components/InboxReplyCompose";
import { MarkReadOnOpen } from "@/components/MarkReadOnOpen";

const CATEGORY_LABELS: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  ooo: "OOO",
  wrong_person: "Wrong person",
  other: "Other",
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    category?: string;
    unread?: string;
    id?: string;
  };
}) {
  const q = searchParams.q?.trim() ?? "";
  const category = searchParams.category ?? "";
  const unreadOnly = searchParams.unread === "1";

  const replies = await prisma.reply.findMany({
    where: {
      ...(unreadOnly ? { readAt: null } : {}),
      ...(category ? { category } : {}),
      OR: [
        { snoozedUntil: null },
        { snoozedUntil: { lte: new Date() } },
      ],
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { snippet: { contains: q, mode: "insensitive" } },
                  { lead: { email: { contains: q, mode: "insensitive" } } },
                  { lead: { firstName: { contains: q, mode: "insensitive" } } },
                  { lead: { company: { contains: q, mode: "insensitive" } } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: { lead: true, account: true },
  });

  const selectedId = searchParams.id || replies[0]?.id;
  const selected = selectedId
    ? await prisma.reply.findUnique({
        where: { id: selectedId },
        include: { lead: true, account: true },
      })
    : null;

  function hrefFor(id: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (unreadOnly) params.set("unread", "1");
    params.set("id", id);
    return `/inbox?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Inbox</h1>
        <form className="flex flex-wrap gap-2 text-sm">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search…"
            className="rounded-md border border-zinc-300 px-3 py-1.5"
          />
          <select
            name="category"
            defaultValue={category}
            className="rounded-md border border-zinc-300 px-2 py-1.5"
          >
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-zinc-600">
            <input type="checkbox" name="unread" value="1" defaultChecked={unreadOnly} />
            Unread
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-white"
          >
            Filter
          </button>
        </form>
      </div>

      <div className="grid min-h-[70vh] gap-0 overflow-hidden rounded-md border border-zinc-200 bg-white lg:grid-cols-[340px_1fr]">
        <div className="max-h-[70vh] overflow-y-auto border-r border-zinc-100">
          {replies.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">No replies match.</p>
          ) : (
            <ul>
              {replies.map((r) => {
                const name = [r.lead.firstName, r.lead.lastName]
                  .filter(Boolean)
                  .join(" ");
                const active = r.id === selected?.id;
                return (
                  <li key={r.id}>
                    <Link
                      href={hrefFor(r.id)}
                      className={`block border-b border-zinc-100 px-4 py-3 hover:bg-zinc-50 ${
                        active ? "bg-zinc-50" : ""
                      } ${!r.readAt ? "font-semibold" : ""}`}
                    >
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate text-zinc-900">
                          {name || r.lead.email}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">
                          {formatRelativeTime(r.receivedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {r.snippet || "(no snippet)"}
                      </p>
                      {r.category && (
                        <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-zinc-500">
                          {CATEGORY_LABELS[r.category] ?? r.category}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {!selected ? (
            <p className="text-sm text-zinc-500">Select a reply</p>
          ) : (
            <>
              <MarkReadOnOpen replyId={selected.id} readAt={selected.readAt} />
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {[selected.lead.firstName, selected.lead.lastName]
                    .filter(Boolean)
                    .join(" ") || selected.lead.email}
                </h2>
                <p className="text-sm text-zinc-500">{selected.lead.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ReplyCategorySelect
                    replyId={selected.id}
                    current={selected.category}
                  />
                  <InboxSnoozeButton
                    replyId={selected.id}
                    snoozedUntil={selected.snoozedUntil}
                  />
                  <Link
                    href={`/leads/${selected.leadId}`}
                    className="text-xs text-zinc-600 underline"
                  >
                    Open lead
                  </Link>
                  <Link
                    href={`/pipeline?focus=${selected.leadId}`}
                    className="text-xs text-zinc-600 underline"
                  >
                    Pipeline
                  </Link>
                </div>
              </div>
              <pre className="whitespace-pre-wrap rounded-md bg-zinc-50 p-4 font-sans text-sm text-zinc-800">
                {selected.body || selected.snippet || "(empty)"}
              </pre>
              <InboxReplyCompose replyId={selected.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
