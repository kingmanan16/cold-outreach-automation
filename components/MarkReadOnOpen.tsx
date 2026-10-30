"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function MarkReadOnOpen({
  replyId,
  readAt,
}: {
  replyId: string;
  readAt: string | Date | null;
}) {
  const router = useRouter();
  useEffect(() => {
    if (readAt) return;
    fetch(`/api/replies/${replyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    }).then(() => router.refresh());
  }, [replyId, readAt, router]);
  return null;
}
