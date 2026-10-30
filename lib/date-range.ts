export type DateRangeKey = "7d" | "30d" | "all";

export function getRangeStart(range: DateRangeKey): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export function chartDayCount(range: DateRangeKey): number {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 14;
}

export function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
