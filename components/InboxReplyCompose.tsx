"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InboxReplyCompose({ replyId }: { replyId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(`/api/replies/${replyId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Send failed");
        return;
      }
      setOk(true);
      setBody("");
      router.refresh();
    } catch {
      setError("Send failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Reply</h3>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        placeholder="Write your reply…"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && (
        <p className="text-sm text-emerald-700">
          Sent — sequence stopped for this lead.
        </p>
      )}
      <button
        type="button"
        disabled={busy || !body.trim()}
        onClick={send}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send reply"}
      </button>
    </div>
  );
}

export function InboxSnoozeButton({
  replyId,
  snoozedUntil,
}: {
  replyId: string;
  snoozedUntil: string | Date | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active =
    snoozedUntil != null && new Date(snoozedUntil).getTime() > Date.now();

  async function snooze(hours: number | null) {
    setBusy(true);
    try {
      const until =
        hours == null ? null : new Date(Date.now() + hours * 60 * 60 * 1000);
      await fetch(`/api/replies/${replyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozedUntil: until?.toISOString() ?? null }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {active ? (
        <>
          <span className="text-amber-700">
            Snoozed until {new Date(snoozedUntil!).toLocaleString()}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => snooze(null)}
            className="underline text-zinc-600 disabled:opacity-50"
          >
            Unsnooze
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => snooze(4)}
            className="underline text-zinc-600 disabled:opacity-50"
          >
            Snooze 4h
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => snooze(24)}
            className="underline text-zinc-600 disabled:opacity-50"
          >
            Snooze 1d
          </button>
        </>
      )}
    </div>
  );
}
