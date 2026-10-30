"use client";

import { useState } from "react";

export function TestConnectionButtons({ accountId }: { accountId: string }) {
  const [smtpMsg, setSmtpMsg] = useState<string | null>(null);
  const [imapMsg, setImapMsg] = useState<string | null>(null);
  const [smtpOk, setSmtpOk] = useState<boolean | null>(null);
  const [imapOk, setImapOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"smtp" | "imap" | null>(null);

  async function test(kind: "smtp" | "imap") {
    setBusy(kind);
    if (kind === "smtp") {
      setSmtpMsg(null);
      setSmtpOk(null);
    } else {
      setImapMsg(null);
      setImapOk(null);
    }

    try {
      const res = await fetch(`/api/accounts/${accountId}/test-${kind}`, {
        method: "POST",
      });
      const data = await res.json();
      const message = data.message ?? (res.ok ? "Success" : "Failed");
      if (kind === "smtp") {
        setSmtpOk(Boolean(data.ok));
        setSmtpMsg(message);
      } else {
        setImapOk(Boolean(data.ok));
        setImapMsg(message);
      }
    } catch {
      if (kind === "smtp") {
        setSmtpOk(false);
        setSmtpMsg("SMTP connection failed");
      } else {
        setImapOk(false);
        setImapMsg("IMAP connection failed");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => test("smtp")}
          disabled={busy !== null}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {busy === "smtp" ? "Testing SMTP…" : "Test SMTP"}
        </button>
        <button
          type="button"
          onClick={() => test("imap")}
          disabled={busy !== null}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {busy === "imap" ? "Testing IMAP…" : "Test IMAP"}
        </button>
      </div>
      {smtpMsg && (
        <p className={`text-xs ${smtpOk ? "text-emerald-700" : "text-red-600"}`}>
          SMTP: {smtpMsg}
        </p>
      )}
      {imapMsg && (
        <p className={`text-xs ${imapOk ? "text-emerald-700" : "text-red-600"}`}>
          IMAP: {imapMsg}
        </p>
      )}
    </div>
  );
}
