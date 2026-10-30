"use client";

import { useRouter } from "next/navigation";

const OPTIONS = [
  { value: "", label: "Uncategorized" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "ooo", label: "OOO" },
  { value: "wrong_person", label: "Wrong person" },
  { value: "other", label: "Other" },
];

export function ReplyCategorySelect({
  replyId,
  current,
}: {
  replyId: string;
  current: string | null;
}) {
  const router = useRouter();

  async function onChange(category: string) {
    if (!category) return;
    const res = await fetch(`/api/replies/${replyId}/category`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <select
      value={current ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value || "none"} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
