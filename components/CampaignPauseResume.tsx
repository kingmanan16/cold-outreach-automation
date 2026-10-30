"use client";

import { CampaignStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignPauseResume({
  campaignId,
  status,
  leadCount = 0,
}: {
  campaignId: string;
  status: CampaignStatus;
  leadCount?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: CampaignStatus) {
    if (next === CampaignStatus.ACTIVE) {
      const ok = window.confirm(
        status === CampaignStatus.DRAFT
          ? `Activate this campaign${leadCount ? ` for ${leadCount} lead(s)` : ""}?\nSending only runs while Active and inside the schedule window (unless you use Send now).`
          : `Resume this campaign${leadCount ? ` (${leadCount} lead(s) attached)` : ""}?\nSending will continue for due leads inside the schedule window.`
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === CampaignStatus.ACTIVE) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus(CampaignStatus.PAUSED)}
        className="text-xs text-amber-700 hover:underline disabled:opacity-50"
      >
        Pause
      </button>
    );
  }

  if (status === CampaignStatus.PAUSED || status === CampaignStatus.DRAFT) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus(CampaignStatus.ACTIVE)}
        className="text-xs text-emerald-700 hover:underline disabled:opacity-50"
      >
        {status === CampaignStatus.DRAFT ? "Activate" : "Resume"}
      </button>
    );
  }

  return <span className="text-xs text-zinc-400">—</span>;
}
