"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadNotes({
  leadId,
  notes,
}: {
  leadId: string;
  notes: Array<{ id: string; content: string; createdAt: string | Date }>;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setContent("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Notes
      </h2>
      <form onSubmit={addNote} className="mb-4 space-y-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Add a note…"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !content.trim()}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Add note"}
        </button>
      </form>
      <ul className="space-y-3">
        {notes.length === 0 ? (
          <li className="text-sm text-zinc-500">No notes yet.</li>
        ) : (
          notes.map((note) => (
            <li
              key={note.id}
              className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
            >
              <p className="whitespace-pre-wrap text-zinc-800">{note.content}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {new Date(note.createdAt).toLocaleString()}
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
