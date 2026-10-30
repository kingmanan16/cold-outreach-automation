"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<{
    globalPaused: boolean;
    bouncePauseThreshold: number;
    bounceMinSample: number;
    slackConfigured?: boolean;
    slackWebhookUrl: string;
  } | null>(null);
  const [slackDraft, setSlackDraft] = useState("");
  const [users, setUsers] = useState<
    Array<{ id: string; email: string; role: string; name: string | null }>
  >([]);
  const [workspaces, setWorkspaces] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [wsName, setWsName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  async function load() {
    const [s, u, w] = await Promise.all([
      fetch("/api/system").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/workspaces").then((r) => r.json()),
    ]);
    setSettings(s);
    setUsers(u.users ?? []);
    setWorkspaces(w.workspaces ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const payload: Record<string, unknown> = {
      action: "update-settings",
      globalPaused: settings.globalPaused,
      bouncePauseThreshold: settings.bouncePauseThreshold,
      bounceMinSample: settings.bounceMinSample,
    };
    // Only send Slack URL when user typed a new one (GET never returns the secret)
    if (slackDraft.trim()) {
      payload.slackWebhookUrl = slackDraft.trim();
    }
    const res = await fetch("/api/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Settings saved" : data.error ?? "Save failed");
    if (res.ok) setSlackDraft("");
    await load();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: newUserEmail,
        password: newUserPassword,
        role: "MEMBER",
      }),
    });
    setNewUserEmail("");
    setNewUserPassword("");
    await load();
  }

  async function addWorkspace(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: wsName }),
    });
    setWsName("");
    await load();
  }

  async function addWebhook(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        events: ["interested_reply", "bounce_pause", "kill_switch", "*"],
      }),
    });
    setWebhookUrl("");
    setMsg("Webhook added");
  }

  if (!settings) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Settings</h1>
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      <form
        onSubmit={saveSettings}
        className="space-y-3 rounded-md border border-zinc-200 bg-white p-5"
      >
        <h2 className="text-sm font-semibold uppercase text-zinc-500">
          Deliverability & pause
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.globalPaused}
            onChange={(e) =>
              setSettings({ ...settings, globalPaused: e.target.checked })
            }
          />
          Global pause (stops all campaign and warmup sends immediately)
        </label>
        <label className="block text-sm">
          Bounce pause threshold (0–1)
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={settings.bouncePauseThreshold}
            onChange={(e) =>
              setSettings({
                ...settings,
                bouncePauseThreshold: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Min sample before bounce pause
          <input
            type="number"
            value={settings.bounceMinSample}
            onChange={(e) =>
              setSettings({
                ...settings,
                bounceMinSample: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Slack webhook URL
          <input
            value={slackDraft}
            onChange={(e) => setSlackDraft(e.target.value)}
            placeholder={
              settings.slackConfigured
                ? "Configured — paste a new URL to replace"
                : "https://hooks.slack.com/services/..."
            }
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white"
        >
          Save
        </button>
      </form>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase text-zinc-500">
          Team seats
        </h2>
        <ul className="text-sm">
          {users.map((u) => (
            <li key={u.id}>
              {u.email} · {u.role}
            </li>
          ))}
        </ul>
        <form onSubmit={addUser} className="flex flex-wrap gap-2">
          <input
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="email"
            className="rounded-md border px-2 py-1.5 text-sm"
            required
          />
          <input
            type="password"
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            placeholder="password"
            className="rounded-md border px-2 py-1.5 text-sm"
            required
          />
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
            Add user
          </button>
        </form>
        <p className="text-xs text-zinc-500">
          Team users can sign in with their email + password on the login page.
          The shared APP_PASSWORD still works for the operator.
        </p>
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase text-zinc-500">
          Workspaces
        </h2>
        <ul className="text-sm">
          {workspaces.map((w) => (
            <li key={w.id}>{w.name}</li>
          ))}
        </ul>
        <form onSubmit={addWorkspace} className="flex gap-2">
          <input
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="Brand / workspace name"
            className="flex-1 rounded-md border px-2 py-1.5 text-sm"
            required
          />
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
            Create
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase text-zinc-500">
          Webhooks
        </h2>
        <form onSubmit={addWebhook} className="flex gap-2">
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/..."
            className="flex-1 rounded-md border px-2 py-1.5 text-sm"
            required
          />
          <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
            Add
          </button>
        </form>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/api/integrations/sheets/export" className="underline">
            Export leads CSV (Sheets)
          </a>
          <button
            type="button"
            className="underline"
            onClick={async () => {
              const res = await fetch("/api/integrations/hubspot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "push-interested" }),
              });
              const data = await res.json();
              setMsg(
                res.ok
                  ? `HubSpot synced ${data.count ?? 0}`
                  : data.error ?? "HubSpot failed"
              );
            }}
          >
            Push interested → HubSpot
          </button>
        </div>
      </section>
    </div>
  );
}
