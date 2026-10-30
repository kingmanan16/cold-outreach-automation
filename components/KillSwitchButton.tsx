"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function KillSwitchButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function pauseAll() {
    if (
      !window.confirm(
        "PAUSE ALL SENDING? This pauses every Active campaign and turns on the global kill switch."
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause-all" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    try {
      await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume-global" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={pauseAll}
        className="w-full rounded-xl bg-danger px-3 py-2.5 text-left text-sm font-medium text-white shadow-soft transition hover:bg-red-700 disabled:opacity-50"
      >
        Pause all sending
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={resume}
        className="w-full rounded-xl px-3 py-1.5 text-left text-xs text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
      >
        Resume kill-switched campaigns
      </button>
    </div>
  );
}
