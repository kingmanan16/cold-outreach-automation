"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignAccountPicker({
  campaignId,
  accounts,
  selectedIds,
}: {
  campaignId: string;
  accounts: Array<{
    id: string;
    email: string;
    dailyLimit: number;
    sentToday: number;
    disabled: boolean;
  }>;
  selectedIds: string[];
}) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>(selectedIds);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: ids }),
      });
      if (!res.ok) {
        setMsg("Failed to save");
        return;
      }
      setMsg(
        ids.length
          ? `Pinned ${ids.length} account(s)`
          : "Using all accounts (round-robin)"
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Leave none selected to use all mailboxes. Pinning limits sending to the
        checked accounts.
      </p>
      <ul className="space-y-2">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ids.includes(a.id)}
              disabled={a.disabled}
              onChange={() => toggle(a.id)}
            />
            <span className={a.disabled ? "text-zinc-400 line-through" : ""}>
              {a.email}
            </span>
            <span className="text-xs text-zinc-500">
              {a.sentToday}/{a.dailyLimit} today
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Save accounts
      </button>
      {msg && <p className="text-xs text-zinc-600">{msg}</p>}
    </div>
  );
}
