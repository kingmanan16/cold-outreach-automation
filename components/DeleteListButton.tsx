"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteListButton({
  listId,
  listName,
  leadCount,
}: {
  listId: string;
  listName: string;
  leadCount: number;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const ok = window.confirm(
      `Delete list "${listName}" and all ${leadCount} lead(s)? This cannot be undone.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/lists/${listId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to delete list");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void handleDelete();
      }}
      disabled={deleting}
      className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {deleting ? "Deleting…" : "Delete list"}
    </button>
  );
}
