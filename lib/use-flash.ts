"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FlashTone = "success" | "error";
export type Flash = { tone: FlashTone; text: string } | null;

/**
 * Inline status message that clears itself.
 *
 * Every form here used to set a "Saved" string and leave it on screen forever,
 * so a message from ten minutes ago looked like it had just happened.
 */
export function useFlash(timeoutMs = 4000) {
  const [flash, setFlash] = useState<Flash>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setFlash(null);
  }, []);

  const show = useCallback(
    (tone: FlashTone, text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setFlash({ tone, text });
      // Errors stay until the next action so they cannot be missed.
      if (tone === "success") {
        timer.current = setTimeout(() => setFlash(null), timeoutMs);
      }
    },
    [timeoutMs]
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { flash, show, clear };
}

export function flashClass(tone: FlashTone): string {
  return tone === "success"
    ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700";
}
