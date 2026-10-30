import Link from "next/link";
import { Suspense } from "react";
import { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LeadsSearch } from "@/components/LeadsSearch";
import { StatusFilter } from "@/components/StatusFilter";
import { LeadsTableClient } from "@/components/LeadsTableClient";
import { DeleteListButton } from "@/components/DeleteListButton";

function toLeadCustomFields(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) out[k] = s;
  }
  return out;
}

const PAGE_SIZE = 50;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    q?: string;
    page?: string;
    list?: string;
  };
}) {
  const listId = searchParams.list?.trim() || "";

  if (!listId) {
    return <ListsHome />;
  }

  return (
    <ListLeadsView
      listId={listId}
      statusFilter={searchParams.status ?? ""}
      query={searchParams.q ?? ""}
      page={Math.max(1, Number(searchParams.page ?? "1") || 1)}
    />
  );
}

async function ListsHome() {
  const lists = await prisma.leadList.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { leads: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="mt-1 text-sm text-ink-mute">
            Open a list to view and manage its leads.
          </p>
        </div>
        <Link
          href="/leads/upload"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Upload CSV
        </Link>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center">
          <p className="text-sm text-zinc-600">No lists yet.</p>
          <Link
            href="/leads/upload"
            className="mt-3 inline-block text-sm font-medium text-teal-800 underline"
          >
            Upload a CSV to create your first list
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((list) => (
            <div
              key={list.id}
              className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-soft transition hover:border-teal-200 hover:shadow-lift"
            >
              <Link
                href={`/leads?list=${list.id}`}
                className="block px-5 py-5"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700/80">
                  List
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink group-hover:text-teal-900">
                  {list.name}
                </h2>
                <p className="mt-2 text-sm text-ink-mute">
                  {list._count.leads} lead{list._count.leads === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs text-ink-mute">
                  Uploaded {list.createdAt.toLocaleDateString()}
                </p>
              </Link>
              <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-2.5">
                <Link
                  href={`/leads?list=${list.id}`}
                  className="text-sm font-medium text-teal-800 hover:underline"
                >
                  Open leads →
                </Link>
                <DeleteListButton
                  listId={list.id}
                  listName={list.name}
                  leadCount={list._count.leads}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function ListLeadsView({
  listId,
  statusFilter,
  query,
  page,
}: {
  listId: string;
  statusFilter: string;
  query: string;
  page: number;
}) {
  const list = await prisma.leadList.findUnique({
    where: { id: listId },
    select: { id: true, name: true },
  });

  if (!list) {
    return (
      <div className="space-y-4">
        <Link
          href="/leads"
          className="inline-flex text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Back to lists
        </Link>
        <p className="text-sm text-zinc-600">List not found.</p>
      </div>
    );
  }

  const where: Prisma.LeadWhereInput = { listId };
  if (
    statusFilter &&
    Object.values(LeadStatus).includes(statusFilter as LeadStatus)
  ) {
    where.status = statusFilter as LeadStatus;
  }
  if (query.trim()) {
    where.OR = [
      { email: { contains: query.trim(), mode: "insensitive" } },
      { company: { contains: query.trim(), mode: "insensitive" } },
      { firstName: { contains: query.trim(), mode: "insensitive" } },
      { lastName: { contains: query.trim(), mode: "insensitive" } },
    ];
  }

  const [total, leads, lists] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: { list: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.leadList.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/leads"
          className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Back to lists
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="page-title">{list.name}</h1>
            <p className="mt-1 text-sm text-ink-mute">
              {total} lead{total === 1 ? "" : "s"} in this list
            </p>
          </div>
          <Link
            href="/leads/upload"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Upload CSV
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={null}>
          <LeadsSearch initialQuery={query} />
        </Suspense>
        <Suspense fallback={null}>
          <StatusFilter initialStatus={statusFilter} />
        </Suspense>
      </div>

      <LeadsTableClient
        leads={leads.map((l) => ({
          id: l.id,
          email: l.email,
          firstName: l.firstName,
          lastName: l.lastName,
          company: l.company,
          status: l.status,
          listName: l.list.name,
          customFields: toLeadCustomFields(l.customFields),
        }))}
        lists={lists}
        hideListColumn
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={buildPageHref(page - 1, statusFilter, query, listId)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildPageHref(page + 1, statusFilter, query, listId)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function buildPageHref(
  page: number,
  status: string,
  q: string,
  listId: string
) {
  const params = new URLSearchParams();
  params.set("list", listId);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  params.set("page", String(page));
  return `/leads?${params.toString()}`;
}
