"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteAccountButton({
  accountId,
  email,
  sentEmailCount,
}: {
  accountId: string;
  email: string;
  sentEmailCount: number;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const warning =
      sentEmailCount > 0
        ? `Delete account "${email}"?\n\nWarning: this account has ${sentEmailCount} sent email(s) in history. Those records will also be removed.`
        : `Delete account "${email}"?`;

    if (!window.confirm(warning)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Failed to delete account");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
