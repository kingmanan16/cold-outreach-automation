import { prisma } from "@/lib/db";
import { assertSafeOutboundUrl, assertSafeSlackWebhookUrl } from "@/lib/safe-url";

export async function getSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

export async function emitWebhook(
  event: string,
  payload: Record<string, unknown>
) {
  const settings = await getSystemSettings();
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { active: true },
  });

  const targets: string[] = [];
  if (settings.slackWebhookUrl) {
    const safe = assertSafeSlackWebhookUrl(settings.slackWebhookUrl);
    if (safe) targets.push(safe);
  }
  for (const ep of endpoints) {
    const events = Array.isArray(ep.events) ? ep.events : [];
    if (events.includes(event) || events.includes("*")) {
      const safe = assertSafeOutboundUrl(ep.url);
      if (safe) targets.push(safe);
    }
  }

  await Promise.allSettled(
    targets.map((url) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, ...payload, at: new Date().toISOString() }),
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      }).catch(() => null)
    )
  );
}
