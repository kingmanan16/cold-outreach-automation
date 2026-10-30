"use client";

import { useState } from "react";

export function UnsubscribeConfirm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/unsubscribe/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to unsubscribe");
        return;
      }
      setDone(true);
    } catch {
      setError("Failed to unsubscribe");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        You have been unsubscribed. You will not receive further emails from this
        campaign tool.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? "Working…" : "Confirm unsubscribe"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
