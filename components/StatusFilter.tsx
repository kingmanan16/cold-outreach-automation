"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LeadStatus } from "@prisma/client";
import { LEAD_STATUS_LABELS } from "@/lib/lead-status";

const FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  ...Object.values(LeadStatus).map((status) => ({
    value: status,
    label: LEAD_STATUS_LABELS[status],
  })),
];

export function StatusFilter({ initialStatus }: { initialStatus: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("status", value);
    } else {
      params.delete("status");
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={initialStatus}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
    >
      {FILTER_OPTIONS.map((opt) => (
        <option key={opt.value || "all"} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
