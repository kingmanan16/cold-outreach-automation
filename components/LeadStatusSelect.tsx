"use client";

import { useRouter } from "next/navigation";
import { LeadStatus } from "@prisma/client";
import { LEAD_STATUS_LABELS } from "@/lib/lead-status";

export function LeadStatusSelect({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: LeadStatus;
}) {
  const router = useRouter();

  async function onChange(status: LeadStatus) {
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <select
      value={currentStatus}
      onChange={(e) => onChange(e.target.value as LeadStatus)}
      className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
    >
      {Object.values(LeadStatus).map((status) => (
        <option key={status} value={status}>
          {LEAD_STATUS_LABELS[status]}
        </option>
      ))}
    </select>
  );
}
