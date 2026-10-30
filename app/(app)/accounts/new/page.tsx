"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewAccountPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      email: form.get("email"),
      smtpHost: form.get("smtpHost"),
      smtpPort: Number(form.get("smtpPort")),
      smtpSecure: form.get("smtpSecure") === "on",
      smtpUser: form.get("smtpUser"),
      smtpPass: form.get("smtpPass"),
      imapHost: form.get("imapHost"),
      imapPort: Number(form.get("imapPort")),
      imapUser: form.get("imapUser"),
      imapPass: form.get("imapPass"),
      dailyLimit: Number(form.get("dailyLimit") || 25),
    };

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create account");
        return;
      }
      router.push("/accounts");
      router.refresh();
    } catch {
      setError("Failed to create account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Add account</h1>
        <Link href="/accounts" className="text-sm text-zinc-600 hover:text-zinc-900">
          Back to accounts
        </Link>
      </div>

      <p className="text-sm text-zinc-500">
        For custom-domain SMTP/IMAP providers like Zoho or GoDaddy (not
        Gmail/Outlook OAuth).
      </p>

      <form onSubmit={onSubmit} className="space-y-6 rounded-md border border-zinc-200 bg-white p-5">
        <Field name="email" label="Email" type="email" required />

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-zinc-900">SMTP</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="smtpHost" label="SMTP host" required placeholder="smtp.zoho.com" />
            <Field name="smtpPort" label="SMTP port" type="number" required defaultValue="465" />
            <Field name="smtpUser" label="SMTP user" required />
            <Field name="smtpPass" label="SMTP password" type="password" required autoComplete="new-password" />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="smtpSecure" defaultChecked className="rounded border-zinc-300" />
            SMTP secure (SSL/TLS)
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-zinc-900">IMAP</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="imapHost" label="IMAP host" required placeholder="imap.zoho.com" />
            <Field name="imapPort" label="IMAP port" type="number" required defaultValue="993" />
            <Field name="imapUser" label="IMAP user" required />
            <Field name="imapPass" label="IMAP password" type="password" required autoComplete="new-password" />
          </div>
        </fieldset>

        <Field
          name="dailyLimit"
          label="Daily limit"
          type="number"
          required
          defaultValue="25"
        />
        <p className="text-xs text-zinc-500">
          Recommend 20–30/day for accounts that aren&apos;t warmed up yet; raise
          gradually over 1–2 weeks.
        </p>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save account"}
        </button>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
  placeholder,
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-zinc-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
      />
    </div>
  );
}
