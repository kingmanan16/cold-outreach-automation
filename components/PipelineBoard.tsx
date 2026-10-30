"use client";

import { LeadStatus } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { LEAD_STATUS_LABELS } from "@/lib/lead-status";

type Card = {
  id: string;
  email: string;
  name: string;
  company: string | null;
  status: LeadStatus;
};

const COLUMNS: LeadStatus[] = [
  LeadStatus.INTERESTED,
  LeadStatus.NEGOTIATING,
  LeadStatus.WON,
  LeadStatus.LOST,
];

export function PipelineBoard({ initial }: { initial: Card[] }) {
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);

  async function move(id: string, status: LeadStatus) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    await fetch(`/api/leads/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => (
        <div
          key={col}
          className="min-h-[420px] rounded-md border border-zinc-200 bg-zinc-50 p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragging) void move(dragging, col);
            setDragging(null);
          }}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {LEAD_STATUS_LABELS[col]} (
            {cards.filter((c) => c.status === col).length})
          </h2>
          <ul className="space-y-2">
            {cards
              .filter((c) => c.status === col)
              .map((c) => (
                <li
                  key={c.id}
                  draggable
                  onDragStart={() => setDragging(c.id)}
                  className="cursor-grab rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing"
                >
                  <Link href={`/leads/${c.id}`} className="font-medium hover:underline">
                    {c.name || c.email}
                  </Link>
                  <p className="text-xs text-zinc-500">{c.email}</p>
                  {c.company && (
                    <p className="text-xs text-zinc-500">{c.company}</p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
