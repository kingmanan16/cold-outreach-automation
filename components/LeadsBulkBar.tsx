"use client";

import { LeadStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadsBulkBar({
  selectedIds,
  lists,
  onCleared,
}: {
  selectedIds: string[];
  lists: Array<{ id: string; name: string }>;
  onCleared: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (selectedIds.length === 0) return null;

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, action, ...extra }),
      });
      onCleared();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
      <span className="font-medium">{selectedIds.length} selected</span>
      <select
        disabled={busy}
        className="rounded-md border px-2 py-1"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) void run("status", { status: e.target.value });
        }}
      >
        <option value="">Set status…</option>
        {Object.values(LeadStatus).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        disabled={busy}
        className="rounded-md border px-2 py-1"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) void run("move-list", { listId: e.target.value });
        }}
      >
        <option value="">Move to list…</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => run("suppress")}
        className="rounded-md border px-2 py-1"
      >
        Suppress
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Delete selected leads permanently?")) {
            void run("delete");
          }
        }}
        className="rounded-md border border-red-300 px-2 py-1 text-red-700"
      >
        Delete
      </button>
    </div>
  );
}
