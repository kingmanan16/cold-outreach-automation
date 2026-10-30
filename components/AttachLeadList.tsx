"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LeadStatus } from "@prisma/client";

type LeadListOption = {
  id: string;
  name: string;
  leadCount: number;
};

const STATUSES = Object.values(LeadStatus);

export function AttachLeadList({
  campaignId,
  lists,
}: {
  campaignId: string;
  lists: LeadListOption[];
}) {
  const router = useRouter();
  const [listId, setListId] = useState(lists[0]?.id ?? "");
  const [statuses, setStatuses] = useState<string[]>(["NEW", "QUEUED"]);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleStatus(s: string) {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  async function attach() {
    setError(null);
    setMessage(null);
    if (!listId) {
      setError("Pick a lead list");
      return;
    }
    if (
      !window.confirm(
        `Attach filtered leads from selected list to this campaign?`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/attach-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId,
          statuses,
          search: search || undefined,
          limit: limit ? Number(limit) : undefined,
          excludeSuppressed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to attach list");
        return;
      }
      setMessage(
        `Attached ${data.attached} (skipped ${data.skipped}, considered ${data.considered})`
      );
      router.refresh();
    } catch {
      setError("Failed to attach list");
    } finally {
      setBusy(false);
    }
  }

  if (lists.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No lead lists yet. Upload leads first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Lead list
          </label>
          <select
            value={listId}
            onChange={(e) => setListId(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.leadCount})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Search
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="email/company"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Limit
          </label>
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            placeholder="all"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={attach}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Attaching…" : "Attach filtered"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleStatus(s)}
            className={`rounded-md px-2 py-1 text-xs ${
              statuses.includes(s)
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 text-zinc-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
    </div>
  );
}
