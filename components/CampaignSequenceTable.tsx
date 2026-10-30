"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampaignLeadStatus } from "@prisma/client";
import {
  progressLabel,
  sequenceStatusChipClass,
  sequenceStatusLabel,
  sequenceUiStatus,
  stopReason,
} from "@/lib/sequence-labels";
import { formatRelativeTime } from "@/lib/date-range";
import { flashClass, useFlash } from "@/lib/use-flash";

export type SequenceRow = {
  id: string;
  leadId: string;
  email: string;
  name: string;
  /** Mails actually delivered to this lead in this campaign. */
  sentCount: number;
  status: CampaignLeadStatus;
  nextSendAt: string | null;
  lastSentAt: string | null;
};

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "due", label: "Due now" },
  { id: "behind", label: "Behind" },
  { id: "replied", label: "Replied" },
  { id: "bounced", label: "Bounced" },
  { id: "finished", label: "Finished" },
  { id: "stopped", label: "Stopped" },
];

const PAGE_SIZES = [25, 50, 100, 200];

export function CampaignSequenceTable({
  campaignId,
  rows,
  totalSteps,
  maxPerTick = 5,
}: {
  campaignId: string;
  rows: SequenceRow[];
  totalSteps: number;
  maxPerTick?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { flash, show } = useFlash();

  // Search, filter and page live in the URL so a refresh or a shared link
  // lands on the same view — the rest of the app already works this way.
  const q = params.get("q") ?? "";
  const filter = params.get("state") ?? "all";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = PAGE_SIZES.includes(Number(params.get("size")))
    ? Number(params.get("size"))
    : 50;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [queryInput, setQueryInput] = useState(q);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  // This page is server-rendered, so writing the query to the URL on every
  // keystroke would round-trip the whole table. Settle first, then sync.
  const setParamsRef = useRef(setParams);
  setParamsRef.current = setParams;
  useEffect(() => {
    if (queryInput === q) return;
    const t = setTimeout(
      () => setParamsRef.current({ q: queryInput, page: null }),
      300
    );
    return () => clearTimeout(t);
  }, [queryInput, q]);

  const decorated = useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        ui: sequenceUiStatus({
          status: r.status,
          nextSendAt: r.nextSendAt ? new Date(r.nextSendAt) : null,
          sentCount: r.sentCount,
          totalSteps,
        }),
      })),
    [rows, totalSteps]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return decorated.filter(({ row, ui }) => {
      if (filter !== "all" && ui !== filter) return false;
      if (!query) return true;
      return (
        row.email.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query)
      );
    });
  }, [decorated, q, filter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: decorated.length };
    for (const { ui } of decorated) map[ui] = (map[ui] ?? 0) + 1;
    return map;
  }, [decorated]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const selectedIds = Array.from(selected);
  const pageIds = slice.map((d) => d.row.leadId);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggle(leadId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function act(
    kind: "send-now" | "re-enroll" | "remove",
    confirmText: string
  ) {
    if (selectedIds.length === 0) return;
    if (!window.confirm(confirmText)) return;

    setBusy(true);
    try {
      const url =
        kind === "remove"
          ? `/api/campaigns/${campaignId}/attach-list`
          : `/api/campaigns/${campaignId}/${kind}`;
      const res = await fetch(url, {
        method: kind === "remove" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        show("error", data.error ?? "That did not work");
        return;
      }
      const n = data.updated ?? data.reEnrolled ?? data.removed ?? 0;
      // n < selection is normal (per-cycle cap, or leads that were not
      // eligible). Saying so beats letting the count look like a bug.
      const short =
        n < selectedIds.length ? ` (${selectedIds.length} were selected)` : "";
      show(
        "success",
        kind === "send-now"
          ? n === 0
            ? "Nothing queued — none of the selected leads are active in this campaign."
            : `Queued ${n} lead(s)${short} — capped at ${maxPerTick} per cycle. Run it again for the next batch.`
          : kind === "re-enroll"
            ? n === 0
              ? "Nothing to resume — the selected leads either already got every mail, or stopped for a reason (replied, bounced, unsubscribed)."
              : `${n} lead(s)${short} back in the sequence at their first unsent mail.`
            : `Removed ${n} lead(s) from this campaign.`
      );
      setSelected(new Set());
      router.refresh();
    } catch {
      show("error", "That did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Search name or email…"
          className="min-w-[200px] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setParams({ state: f.id, page: null })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                filter === f.id
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {f.label}
              <span className="ml-1 opacity-60 tabular-nums">
                {counts[f.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2">
          <span className="text-sm font-medium text-zinc-800">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                "send-now",
                `Queue ${selectedIds.length} selected lead(s) to send next?\n\nThis skips the send window once. Daily cap and the ${maxPerTick}-per-cycle limit still apply.`
              )
            }
            className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Send now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                "re-enroll",
                `Put ${selectedIds.length} selected lead(s) back in the sequence at their first unsent mail?\n\nMails they already received are not sent again.`
              )
            }
            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
          >
            Resume follow-ups
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                "remove",
                `Remove ${selectedIds.length} lead(s) from this campaign?\n\nTheir send history stays. They simply stop receiving anything further here.`
              )
            }
            className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Remove from campaign
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-zinc-500 underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {flash && <p className={flashClass(flash.tone)}>{flash.text}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <p>
          Showing {slice.length} of {filtered.length} lead
          {filtered.length === 1 ? "" : "s"}
        </p>
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => setParams({ size: e.target.value, page: null })}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50/90 text-ink-mute backdrop-blur">
              <tr>
                <th className="w-10 px-4 py-3.5">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                </th>
                <th className="px-4 py-3.5 font-medium">Lead</th>
                <th className="px-4 py-3.5 font-medium">Progress</th>
                <th className="px-4 py-3.5 font-medium">Status</th>
                <th className="px-4 py-3.5 font-medium">Last sent</th>
                <th className="px-4 py-3.5 font-medium">Next send</th>
                <th className="px-4 py-3.5 font-medium">Stopped why</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-ink-mute"
                  >
                    No leads match this filter.
                  </td>
                </tr>
              ) : (
                slice.map(({ row: r, ui }) => (
                  <tr
                    key={r.id}
                    className={`border-t border-line/70 transition hover:bg-slate-50/70 ${
                      selected.has(r.leadId) ? "bg-sky-50/60" : ""
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.email}`}
                        checked={selected.has(r.leadId)}
                        onChange={() => toggle(r.leadId)}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/leads/${r.leadId}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {r.name || r.email}
                      </Link>
                      {r.name && (
                        <p className="text-xs text-ink-mute">{r.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ink-soft">
                      {progressLabel({
                        sentCount: r.sentCount,
                        status: r.status,
                        totalSteps,
                      })}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`chip ${sequenceStatusChipClass(ui)}`}>
                        {sequenceStatusLabel(ui)}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3.5 text-ink-mute"
                      title={
                        r.lastSentAt
                          ? new Date(r.lastSentAt).toLocaleString()
                          : undefined
                      }
                    >
                      {r.lastSentAt
                        ? formatRelativeTime(new Date(r.lastSentAt))
                        : "—"}
                    </td>
                    <td
                      className="px-4 py-3.5 text-ink-mute"
                      title={
                        r.nextSendAt
                          ? new Date(r.nextSendAt).toLocaleString()
                          : undefined
                      }
                    >
                      {r.nextSendAt
                        ? new Date(r.nextSendAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-ink-mute">
                      {stopReason(r.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={pageSafe <= 1}
            onClick={() => setParams({ page: String(pageSafe - 1) })}
            className="rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-zinc-500">
            Page {pageSafe} of {totalPages}
          </span>
          <button
            type="button"
            disabled={pageSafe >= totalPages}
            onClick={() => setParams({ page: String(pageSafe + 1) })}
            className="rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
