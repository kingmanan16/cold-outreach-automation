"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LeadStatus } from "@prisma/client";
import { StatusBadge } from "@/lib/lead-status";
import { LeadsBulkBar } from "@/components/LeadsBulkBar";

type LeadRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: LeadStatus;
  listName: string;
  customFields: Record<string, string>;
};

const PREFERRED_EXTRA_ORDER = [
  "Location",
  "LinkedIn",
  "Linkedin",
  "LinkedIn Profile",
  "Job Title",
  "Designation",
  "Full Name",
  "Company Domain",
  "Company Website",
];

function CellValue({ value }: { value: string }) {
  if (!value) return <span className="text-zinc-400">—</span>;
  if (/^https?:\/\//i.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="text-teal-800 underline decoration-teal-300/60 underline-offset-2 hover:text-teal-950"
        onClick={(e) => e.stopPropagation()}
      >
        {value.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 42)}
        {value.length > 48 ? "…" : ""}
      </a>
    );
  }
  return <span className="text-zinc-700">{value}</span>;
}

export function LeadsTableClient({
  leads,
  lists,
  hideListColumn = false,
}: {
  leads: LeadRow[];
  lists: Array<{ id: string; name: string }>;
  hideListColumn?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const allIds = useMemo(() => leads.map((l) => l.id), [leads]);

  const extraKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const lead of leads) {
      for (const k of Object.keys(lead.customFields ?? {})) keys.add(k);
    }
    const all = Array.from(keys);
    const preferred = PREFERRED_EXTRA_ORDER.filter((k) => keys.has(k));
    const rest = all
      .filter((k) => !PREFERRED_EXTRA_ORDER.includes(k))
      .sort((a, b) => a.localeCompare(b));
    return preferred.concat(rest);
  }, [leads]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    setSelected((prev) => (prev.length === allIds.length ? [] : allIds));
  }

  function scrollBy(delta: number) {
    scrollerRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  const stickyHead =
    "sticky z-20 bg-zinc-50 shadow-[1px_0_0_0_rgba(228,228,231,1)]";
  const stickyCell =
    "sticky z-10 bg-white shadow-[1px_0_0_0_rgba(244,244,245,1)] group-hover:bg-teal-50/50";

  return (
    <div className="space-y-3">
      <LeadsBulkBar
        selectedIds={selected}
        lists={lists}
        onCleared={() => setSelected([])}
      />

      {extraKeys.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-600">
          <p>
            Scroll right for more columns ({extraKeys.length}:{" "}
            {extraKeys.slice(0, 3).join(", ")}
            {extraKeys.length > 3 ? "…" : ""})
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scrollBy(-280)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50"
            >
              ← Slide
            </button>
            <button
              type="button"
              onClick={() => scrollBy(280)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50"
            >
              Slide →
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div
          ref={scrollerRef}
          className="overflow-x-auto overscroll-x-contain"
        >
          <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="text-zinc-600">
              <tr>
                <th
                  className={`${stickyHead} left-0 px-4 py-3`}
                  style={{ minWidth: 48 }}
                >
                  <input
                    type="checkbox"
                    checked={
                      selected.length === allIds.length && allIds.length > 0
                    }
                    onChange={toggleAll}
                  />
                </th>
                <th
                  className={`${stickyHead} left-12 px-4 py-3 font-medium`}
                  style={{ minWidth: 220 }}
                >
                  Email
                </th>
                <th
                  className={`${stickyHead} px-4 py-3 font-medium`}
                  style={{ left: 268, minWidth: 150 }}
                >
                  Name
                </th>
                <th
                  className={`${stickyHead} px-4 py-3 font-medium`}
                  style={{ left: 418, minWidth: 160 }}
                >
                  Company
                </th>
                <th
                  className={`${stickyHead} px-4 py-3 font-medium`}
                  style={{ left: 578, minWidth: 110 }}
                >
                  Status
                </th>
                {!hideListColumn && (
                  <th className="bg-zinc-50 px-4 py-3 font-medium whitespace-nowrap">
                    List
                  </th>
                )}
                {extraKeys.map((key) => (
                  <th
                    key={key}
                    className="bg-zinc-50 px-4 py-3 font-medium whitespace-nowrap"
                    style={{ minWidth: 160 }}
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const name = [lead.firstName, lead.lastName]
                  .filter(Boolean)
                  .join(" ");
                const fields = lead.customFields ?? {};
                return (
                  <tr
                    key={lead.id}
                    className="group border-t border-zinc-100 hover:bg-teal-50/40"
                  >
                    <td
                      className={`${stickyCell} left-0 px-4 py-3`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(lead.id)}
                        onChange={() => toggle(lead.id)}
                      />
                    </td>
                    <td
                      className={`${stickyCell} left-12 px-4 py-3 font-medium text-zinc-900`}
                      style={{ minWidth: 220 }}
                    >
                      <Link
                        href={`/leads/${lead.id}`}
                        className="hover:underline"
                      >
                        {lead.email}
                      </Link>
                    </td>
                    <td
                      className={`${stickyCell} px-4 py-3 text-zinc-700`}
                      style={{ left: 268, minWidth: 150 }}
                    >
                      {name || "—"}
                    </td>
                    <td
                      className={`${stickyCell} px-4 py-3 text-zinc-700`}
                      style={{ left: 418, minWidth: 160 }}
                    >
                      {lead.company || "—"}
                    </td>
                    <td
                      className={`${stickyCell} px-4 py-3`}
                      style={{ left: 578, minWidth: 110 }}
                    >
                      <StatusBadge status={lead.status} />
                    </td>
                    {!hideListColumn && (
                      <td className="px-4 py-3 text-zinc-700 whitespace-nowrap">
                        {lead.listName}
                      </td>
                    )}
                    {extraKeys.map((key) => (
                      <td
                        key={key}
                        className="max-w-[240px] truncate px-4 py-3 whitespace-nowrap"
                        title={fields[key] || undefined}
                      >
                        <CellValue value={fields[key] || ""} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
