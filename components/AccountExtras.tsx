"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountDnsButton({ accountId }: { accountId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/dns`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "DNS check failed");
        return;
      }
      setMsg(
        `SPF ${data.spfOk ? "OK" : "FAIL"} · DMARC ${data.dmarcOk ? "OK" : "FAIL"}`
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="text-xs text-zinc-700 underline disabled:opacity-50"
      >
        {busy ? "Checking…" : "Check DNS"}
      </button>
      {msg && <p className="text-[10px] text-zinc-500">{msg}</p>}
    </div>
  );
}

export function AccountWarmupToggle({
  accountId,
  enabled,
}: {
  accountId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);

  async function toggle() {
    const next = !on;
    setOn(next);
    await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warmupEnabled: next }),
    });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`text-xs underline ${on ? "text-emerald-700" : "text-zinc-600"}`}
    >
      Warmup {on ? "on" : "off"}
    </button>
  );
}

export function AccountPlacementButton({ accountId }: { accountId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/placement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Failed");
        return;
      }
      setMsg(
        `Heuristic: ${data.result} (${data.score}) — not a live seed inbox`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="text-[10px] text-zinc-600 underline disabled:opacity-50"
      >
        {busy ? "…" : "Placement estimate"}
      </button>
      {msg && <p className="text-[10px] text-zinc-500">{msg}</p>}
    </div>
  );
}
