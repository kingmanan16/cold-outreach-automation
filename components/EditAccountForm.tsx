"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AccountFields = {
  id: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  dailyLimit: number;
  isWarmedUp: boolean;
  credentialsConfigured: boolean;
};

export function EditAccountForm({ account }: { account: AccountFields }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isWarmedUp, setIsWarmedUp] = useState(account.isWarmedUp);

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
      smtpPass: String(form.get("smtpPass") ?? ""),
      imapHost: form.get("imapHost"),
      imapPort: Number(form.get("imapPort")),
      imapUser: form.get("imapUser"),
      imapPass: String(form.get("imapPass") ?? ""),
      dailyLimit: Number(form.get("dailyLimit")),
      isWarmedUp,
    };

    try {
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update account");
        return;
      }
      router.push("/accounts");
      router.refresh();
    } catch {
      setError("Failed to update account");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-md border border-zinc-200 bg-white p-5"
    >
      <Field name="email" label="Email" type="email" required defaultValue={account.email} />

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-zinc-900">SMTP</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="smtpHost" label="SMTP host" required defaultValue={account.smtpHost} />
          <Field
            name="smtpPort"
            label="SMTP port"
            type="number"
            required
            defaultValue={String(account.smtpPort)}
          />
          <Field name="smtpUser" label="SMTP user" required defaultValue={account.smtpUser} />
          <Field
            name="smtpPass"
            label="SMTP password"
            type="password"
            placeholder="Leave blank to keep current"
            autoComplete="new-password"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="smtpSecure"
            defaultChecked={account.smtpSecure}
            className="rounded border-zinc-300"
          />
          SMTP secure (SSL/TLS)
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-zinc-900">IMAP</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field name="imapHost" label="IMAP host" required defaultValue={account.imapHost} />
          <Field
            name="imapPort"
            label="IMAP port"
            type="number"
            required
            defaultValue={String(account.imapPort)}
          />
          <Field name="imapUser" label="IMAP user" required defaultValue={account.imapUser} />
          <Field
            name="imapPass"
            label="IMAP password"
            type="password"
            placeholder="Leave blank to keep current"
            autoComplete="new-password"
          />
        </div>
        {account.credentialsConfigured && (
          <p className="text-xs text-zinc-500">
            Credentials are configured. Leave password fields blank to keep the
            current encrypted passwords.
          </p>
        )}
      </fieldset>

      <Field
        name="dailyLimit"
        label="Daily limit"
        type="number"
        required
        defaultValue={String(account.dailyLimit)}
      />

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={isWarmedUp}
          onChange={(e) => setIsWarmedUp(e.target.checked)}
          className="rounded border-zinc-300"
        />
        Account is warmed up
      </label>

      {!isWarmedUp && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Recommend a daily limit of 20–30 for accounts that aren&apos;t warmed up
          yet. Raise gradually over 1–2 weeks.
        </p>
      )}

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
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
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
