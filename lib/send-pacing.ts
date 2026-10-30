/** Seconds to wait between two outbound campaign emails. */
export function clampSendGapSec(value: unknown, fallback = 90): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(600, Math.max(15, Math.floor(n)));
}

/** How many emails one worker loop may send. */
export function clampMaxPerTick(value: unknown, fallback = 5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

/**
 * Follow-up must wait at least 1 calendar day so Mail 2 cannot fire
 * in the same burst as Mail 1.
 */
export function nextFollowUpAt(from: Date, delayDays: number): Date {
  const days = Math.max(1, Math.floor(Number(delayDays) || 0));
  const at = new Date(from.getTime());
  at.setDate(at.getDate() + days);
  return at;
}
