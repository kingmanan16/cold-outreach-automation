"use client";

import { useEffect, useState } from "react";

type Row = { id: string; email: string; reason: string | null; createdAt: string };

export default function SuppressionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    const res = await fetch("/api/suppression");
    const data = await res.json();
    setRows(data.suppressions ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/suppression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, reason }),
    });
    setEmail("");
    setReason("");
    await load();
  }

  async function remove(addr: string) {
    await fetch("/api/suppression", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr }),
    });
    await load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Suppressions</h1>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@company.com"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          required
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="reason"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white"
        >
          Add
        </button>
      </form>
      <ul className="divide-y rounded-md border border-zinc-200 bg-white">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium">{r.email}</p>
              <p className="text-xs text-zinc-500">{r.reason}</p>
            </div>
            <button
              type="button"
              onClick={() => remove(r.email)}
              className="text-xs text-red-600"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
