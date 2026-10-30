"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { flashClass, useFlash } from "@/lib/use-flash";

const LIMITS = {
  dailyCap: { min: 1, max: 10000 },
  sendGapSec: { min: 15, max: 600 },
  maxPerTick: { min: 1, max: 50 },
} as const;

/** The worker wakes on this cycle, so throughput is capped by it too. */
const LOOP_MINUTES = 2;

function fieldError(
  key: keyof typeof LIMITS,
  raw: string
): string | null {
  const n = Number(raw);
  const { min, max } = LIMITS[key];
  if (raw.trim() === "") return "Required";
  if (!Number.isFinite(n)) return "Numbers only";
  if (!Number.isInteger(n)) return "Whole numbers only";
  if (n < min || n > max) return `Must be between ${min} and ${max}`;
  return null;
}

export function CampaignDailyCapForm({
  campaignId,
  dailyCap,
  sendGapSec = 90,
  maxPerTick = 5,
  threadFollowUps = true,
}: {
  campaignId: string;
  dailyCap: number;
  sendGapSec?: number;
  maxPerTick?: number;
  threadFollowUps?: boolean;
}) {
  const router = useRouter();
  const { flash, show } = useFlash();
  const [cap, setCap] = useState(String(dailyCap ?? 45));
  const [gap, setGap] = useState(String(sendGapSec ?? 90));
  const [perTick, setPerTick] = useState(String(maxPerTick ?? 5));
  const [threaded, setThreaded] = useState(threadFollowUps);
  const [saving, setSaving] = useState(false);

  const errors = {
    dailyCap: fieldError("dailyCap", cap),
    sendGapSec: fieldError("sendGapSec", gap),
    maxPerTick: fieldError("maxPerTick", perTick),
  };
  const hasError = Object.values(errors).some(Boolean);

  // These three interact in ways nobody can work out from the labels alone.
  const estimate = useMemo(() => {
    if (hasError) return null;
    const g = Number(gap);
    const perCycle = Number(perTick);
    const capN = Number(cap);
    const cycleSeconds = Math.max(LOOP_MINUTES * 60, perCycle * g);
    const perHour = Math.floor((3600 / cycleSeconds) * perCycle);
    if (perHour <= 0) return null;
    const hoursToCap = capN / perHour;
    return { perHour, hoursToCap };
  }, [cap, gap, perTick, hasError]);

  async function save() {
    if (hasError) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyCap: Number(cap),
          sendGapSec: Number(gap),
          maxPerTick: Number(perTick),
          threadFollowUps: threaded,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        show("error", data.error ?? "Failed to save");
        return;
      }
      show(
        "success",
        `Saved — ${data.dailyCap}/day, ${data.sendGapSec}s between sends, ${data.maxPerTick} per cycle.`
      );
      router.refresh();
    } catch {
      show("error", "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function field(
    key: keyof typeof LIMITS,
    label: string,
    hint: string,
    value: string,
    onChange: (v: string) => void
  ) {
    const err = errors[key];
    return (
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">{label}</span>
        <input
          type="number"
          min={LIMITS[key].min}
          max={LIMITS[key].max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(err)}
          className={`w-32 rounded-md border px-3 py-2 text-sm ${
            err ? "border-red-400 bg-red-50" : "border-zinc-300"
          }`}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          {err ? <span className="text-red-600">{err}</span> : hint}
        </span>
      </label>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        {field(
          "dailyCap",
          "Max emails / day",
          `${LIMITS.dailyCap.min}–${LIMITS.dailyCap.max} · hard stop for this campaign`,
          cap,
          setCap
        )}
        {field(
          "sendGapSec",
          "Wait between sends",
          `${LIMITS.sendGapSec.min}–${LIMITS.sendGapSec.max} seconds · spacing looks human`,
          gap,
          setGap
        )}
        {field(
          "maxPerTick",
          "Emails per cycle",
          `${LIMITS.maxPerTick.min}–${LIMITS.maxPerTick.max} · the worker runs every ${LOOP_MINUTES} min`,
          perTick,
          setPerTick
        )}
      </div>

      {estimate && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          At this pace: roughly{" "}
          <span className="font-medium text-zinc-900">
            {estimate.perHour} emails/hour
          </span>
          , so today&apos;s cap of {cap} takes about{" "}
          <span className="font-medium text-zinc-900">
            {estimate.hoursToCap < 1
              ? "under an hour"
              : `${Math.round(estimate.hoursToCap * 10) / 10} hours`}
          </span>{" "}
          of open send window.
        </p>
      )}

      <label className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          checked={threaded}
          onChange={(e) => setThreaded(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300"
        />
        <span>
          <span className="font-medium text-zinc-800">
            Reply in the same thread
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            Follow-ups go out as replies to Mail 1, from the same mailbox that
            sent it, reusing its subject as &ldquo;Re: …&rdquo;. Turn this off
            to send each follow-up as a separate new email with its own subject.
          </span>
        </span>
      </label>

      {flash && <p className={flashClass(flash.tone)}>{flash.text}</p>}

      <button
        type="button"
        onClick={save}
        disabled={saving || hasError}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save pace"}
      </button>
    </div>
  );
}
