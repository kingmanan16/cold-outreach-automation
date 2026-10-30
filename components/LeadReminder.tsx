"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadReminder({
  leadId,
  reminderAt,
}: {
  leadId: string;
  reminderAt: string | Date | null;
}) {
  const router = useRouter();
  const initial = reminderAt
    ? new Date(reminderAt).toISOString().slice(0, 10)
    : "";
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/reminder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderAt: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Reminder
      </dt>
      <dd className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={busy || !value}
          onClick={() => save(value)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50"
        >
          Save
        </button>
        {reminderAt && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setValue("");
              void save(null);
            }}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </dd>
    </div>
  );
}
