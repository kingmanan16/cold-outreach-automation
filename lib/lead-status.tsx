import { LeadStatus } from "@prisma/client";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  QUEUED: "Queued",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not interested",
  BOUNCED: "Bounced",
  UNSUBSCRIBED: "Unsubscribed",
  NEGOTIATING: "Negotiating",
  WON: "Won",
  LOST: "Lost",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: "bg-zinc-100 text-zinc-700",
  QUEUED: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  REPLIED: "bg-emerald-100 text-emerald-700",
  INTERESTED: "bg-green-100 text-green-800",
  NOT_INTERESTED: "bg-orange-100 text-orange-800",
  BOUNCED: "bg-red-100 text-red-700",
  UNSUBSCRIBED: "bg-yellow-100 text-yellow-800",
  NEGOTIATING: "bg-purple-100 text-purple-800",
  WON: "bg-teal-100 text-teal-800",
  LOST: "bg-zinc-200 text-zinc-600",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${LEAD_STATUS_COLORS[status]}`}
    >
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}
