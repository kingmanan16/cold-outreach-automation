"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flashClass, useFlash } from "@/lib/use-flash";

export function CampaignSendNowButton({
  campaignId,
  leadIds,
  maxPerTick,
  label = "Send now",
  onDone,
}: {
  campaignId: string;
  leadIds?: string[];
  maxPerTick?: number;
  label?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { flash, show } = useFlash();
  const [busy, setBusy] = useState(false);

  const batch = maxPerTick ?? 5;

  async function run() {
    // Say the real number: "a small batch" left people guessing how many went out.
    const question = leadIds?.length
      ? `Queue ${leadIds.length} selected lead(s) to send on the next worker cycle?\n\nThis skips the send window once. Daily cap and the ${batch}-per-cycle limit still apply.`
      : `Queue the next ${batch} due lead(s) — not the whole list?\n\nThis skips the send window once. Run it again for the next ${batch}.`;
    if (!window.confirm(question)) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        show("error", data.error ?? "Could not queue these leads");
        return;
      }
      show(
        "success",
        data.updated === 0
          ? "Nothing to queue — no active leads matched."
          : `Queued ${data.updated} lead(s). The worker sends them within ~2 minutes.`
      );
      onDone?.();
      router.refresh();
    } catch {
      show("error", "Could not queue these leads");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
      >
        {busy ? "Queueing…" : label}
      </button>
      {flash && <p className={flashClass(flash.tone)}>{flash.text}</p>}
    </div>
  );
}
