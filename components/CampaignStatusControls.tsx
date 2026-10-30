"use client";

import { CampaignStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const OPTIONS: Array<{ value: CampaignStatus; label: string }> = [
  { value: CampaignStatus.DRAFT, label: "Draft" },
  { value: CampaignStatus.ACTIVE, label: "Active" },
  { value: CampaignStatus.PAUSED, label: "Paused" },
];

export function CampaignStatusControls({
  campaignId,
  currentStatus,
  leadCount = 0,
  dailyCapacity = 0,
}: {
  campaignId: string;
  currentStatus: CampaignStatus;
  leadCount?: number;
  dailyCapacity?: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function updateStatus(next: CampaignStatus) {
    if (next === CampaignStatus.ACTIVE && leadCount > 0) {
      const ok = window.confirm(
        `Activate campaign for ${leadCount} lead(s)?\nEstimated daily capacity across mailboxes: ~${dailyCapacity}.\nOnly send inside the campaign schedule window unless you use Send now.`
      );
      if (!ok) return;
    }

    setError(null);
    setSaving(true);
    setStatus(next);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update status");
        setStatus(currentStatus);
        return;
      }
      router.refresh();
    } catch {
      setError("Failed to update status");
      setStatus(currentStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving || status === opt.value}
            onClick={() => updateStatus(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              status === opt.value
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            } disabled:opacity-50`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        Only <span className="font-medium text-zinc-700">Active</span> campaigns
        send, and only inside the schedule window (unless Send now).
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
