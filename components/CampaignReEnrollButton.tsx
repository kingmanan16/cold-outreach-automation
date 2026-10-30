"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { flashClass, useFlash } from "@/lib/use-flash";

/**
 * Puts leads that finished an older, shorter sequence back into it.
 * Adding a follow-up does not move them on its own, so without this they
 * sit at "finished" and silently never receive the new mail.
 */
export function CampaignReEnrollButton({
  campaignId,
  count,
  leadIds,
  label,
}: {
  campaignId: string;
  count?: number;
  leadIds?: string[];
  label?: string;
}) {
  const router = useRouter();
  const { flash, show } = useFlash();
  const [busy, setBusy] = useState(false);

  const n = leadIds?.length ?? count ?? 0;
  const text =
    label ?? (n > 0 ? `Resume follow-ups for ${n} lead${n === 1 ? "" : "s"}` : "Resume follow-ups");

  async function run() {
    if (
      !window.confirm(
        `Put ${n || "these"} lead(s) back in the sequence at the first mail they never received?\n\nMails they already got will not be sent again. Send window, daily cap and pacing still apply.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/re-enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        show("error", data.error ?? "Could not resume follow-ups");
        return;
      }
      show(
        "success",
        `${data.reEnrolled} lead(s) back in the sequence — they will send on the campaign's normal schedule.`
      );
      router.refresh();
    } catch {
      show("error", "Could not resume follow-ups");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || n === 0}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? "Resuming…" : text}
      </button>
      {flash && <p className={flashClass(flash.tone)}>{flash.text}</p>}
    </div>
  );
}
