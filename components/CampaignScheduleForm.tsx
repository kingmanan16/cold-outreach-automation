"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatWindowLabel, parseSendDays } from "@/lib/send-window";

const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Singapore",
  "Asia/Tokyo",
];

const DAY_LABELS = [
  { v: 0, l: "Sun" },
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
];

function minsToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function timeToMins(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function CampaignScheduleForm({
  campaignId,
  timezone,
  scheduledStartAt,
  sendWindowStartMin,
  sendWindowEndMin,
  sendDays,
}: {
  campaignId: string;
  timezone: string;
  scheduledStartAt: string | Date | null;
  sendWindowStartMin: number;
  sendWindowEndMin: number;
  sendDays: unknown;
}) {
  const router = useRouter();
  const [tz, setTz] = useState(timezone || "Asia/Kolkata");
  const [startAt, setStartAt] = useState(
    scheduledStartAt
      ? new Date(scheduledStartAt).toISOString().slice(0, 16)
      : ""
  );
  const [winStart, setWinStart] = useState(minsToTime(sendWindowStartMin ?? 540));
  const [winEnd, setWinEnd] = useState(minsToTime(sendWindowEndMin ?? 1080));
  const [days, setDays] = useState<number[]>(parseSendDays(sendDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      formatWindowLabel({
        timezone: tz,
        sendWindowStartMin: timeToMins(winStart),
        sendWindowEndMin: timeToMins(winEnd),
        sendDays: days,
        scheduledStartAt: startAt || null,
      }),
    [tz, winStart, winEnd, days, startAt]
  );

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: tz,
          scheduledStartAt: startAt ? new Date(startAt).toISOString() : null,
          sendWindowStartMin: timeToMins(winStart),
          sendWindowEndMin: timeToMins(winEnd),
          sendDays: days,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save schedule");
        return;
      }
      setOk("Schedule saved");
      router.refresh();
    } catch {
      setError("Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Timezone</span>
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {TIMEZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">
            Start sending at (optional)
          </span>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Window start</span>
          <input
            type="time"
            value={winStart}
            onChange={(e) => setWinStart(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Window end</span>
          <input
            type="time"
            value={winEnd}
            onChange={(e) => setWinEnd(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-zinc-700">Send days</p>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((d) => (
            <button
              key={d.v}
              type="button"
              onClick={() => toggleDay(d.v)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                days.includes(d.v)
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-600"
              }`}
            >
              {d.l}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-zinc-500">{preview}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-emerald-700">{ok}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save schedule"}
      </button>
    </div>
  );
}
