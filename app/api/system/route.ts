import { NextResponse } from "next/server";
import { CampaignStatus } from "@prisma/client";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSystemSettings, emitWebhook } from "@/lib/notifications";
import { assertSafeSlackWebhookUrl } from "@/lib/safe-url";

function publicSettings(settings: Awaited<ReturnType<typeof getSystemSettings>>) {
  return {
    id: settings.id,
    globalPaused: settings.globalPaused,
    bouncePauseThreshold: settings.bouncePauseThreshold,
    bounceMinSample: settings.bounceMinSample,
    slackConfigured: Boolean(settings.slackWebhookUrl),
    // Never return the raw Slack webhook secret
    slackWebhookUrl: "",
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const settings = await getSystemSettings();
  return NextResponse.json(publicSettings(settings));
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "pause-all");

  if (action === "pause-all") {
    const active = await prisma.campaign.findMany({
      where: { status: CampaignStatus.ACTIVE },
      select: { id: true },
    });
    const updated = await prisma.campaign.updateMany({
      where: { status: CampaignStatus.ACTIVE },
      data: { status: CampaignStatus.PAUSED, pausedByKillSwitch: true },
    });
    await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default", globalPaused: true },
      update: { globalPaused: true },
    });
    await emitWebhook("kill_switch", {
      pausedCampaigns: updated.count,
      ids: active.map((c) => c.id),
    });
    return NextResponse.json({
      ok: true,
      pausedCampaigns: updated.count,
      globalPaused: true,
    });
  }

  if (action === "resume-global") {
    const resumed = await prisma.campaign.updateMany({
      where: { pausedByKillSwitch: true, status: CampaignStatus.PAUSED },
      data: { status: CampaignStatus.ACTIVE, pausedByKillSwitch: false },
    });
    await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default", globalPaused: false },
      update: { globalPaused: false },
    });
    await prisma.campaign.updateMany({
      where: { pausedByKillSwitch: true },
      data: { pausedByKillSwitch: false },
    });
    return NextResponse.json({
      ok: true,
      globalPaused: false,
      resumedCampaigns: resumed.count,
    });
  }

  if (action === "update-settings") {
    const data: {
      bouncePauseThreshold?: number;
      bounceMinSample?: number;
      slackWebhookUrl?: string | null;
      globalPaused?: boolean;
    } = {};
    if (body.bouncePauseThreshold !== undefined) {
      data.bouncePauseThreshold = Number(body.bouncePauseThreshold);
    }
    if (body.bounceMinSample !== undefined) {
      data.bounceMinSample = Number(body.bounceMinSample);
    }
    if (body.slackWebhookUrl !== undefined) {
      const raw = String(body.slackWebhookUrl ?? "").trim();
      if (!raw) {
        data.slackWebhookUrl = null;
      } else {
        const safe = assertSafeSlackWebhookUrl(raw);
        if (!safe) {
          return NextResponse.json(
            {
              error:
                "Invalid Slack webhook URL (https://hooks.slack.com/services/... only)",
            },
            { status: 400 }
          );
        }
        data.slackWebhookUrl = safe;
      }
    }
    if (body.globalPaused !== undefined) {
      data.globalPaused = Boolean(body.globalPaused);
    }
    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
    return NextResponse.json(publicSettings(settings));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
