import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendOutboundMail } from "@/lib/mail-send";
import { renderTemplate } from "@/lib/template";
import { checkEmailContent } from "@/lib/spam-check";
import { pickAbVariant } from "@/lib/ab-variant";
import { isGoogleOAuthAccount } from "@/lib/gmail-oauth";
import {
  buildOutboundEmailBodies,
  looksLikeHtml,
  newSentEmailId,
} from "@/lib/tracking";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const to = String(body.to ?? "").trim();
  const stepOrder = Number(body.stepOrder ?? 0);
  const step =
    campaign.steps.find((s) => s.stepOrder === stepOrder) ?? campaign.steps[0];
  if (!step || !to) {
    return NextResponse.json({ error: "to and step required" }, { status: 400 });
  }

  const { subjectTemplate, bodyTemplate, variant } = pickAbVariant(step);
  const spam = checkEmailContent(subjectTemplate, bodyTemplate);
  if (!spam.ok) {
    return NextResponse.json(
      { error: spam.blockers.join("; "), spam },
      { status: 400 }
    );
  }

  const account = await prisma.emailAccount.findFirst({
    where: { disabled: false },
    orderBy: { sentToday: "asc" },
  });
  if (!account) {
    return NextResponse.json({ error: "No account" }, { status: 400 });
  }

  // Prefer an OAuth-connected mailbox when available (Gmail API)
  const oauthAccount =
    (await prisma.emailAccount.findFirst({
      where: {
        disabled: false,
        oauthProvider: "google",
        OR: [
          { oauthAccessEnc: { not: null } },
          { oauthRefreshEnc: { not: null } },
        ],
      },
      orderBy: { sentToday: "asc" },
    })) ?? account;

  // Prefer a real campaign lead so {{custom fields}} fill in test mail
  const campaignLead = await prisma.campaignLead.findFirst({
    where: { campaignId: params.id },
    include: { lead: true },
    orderBy: { id: "asc" },
  });
  const anyLead =
    campaignLead?.lead ??
    (await prisma.lead.findFirst({ orderBy: { createdAt: "desc" } }));

  const sample = {
    email: anyLead?.email ?? to,
    firstName: anyLead?.firstName ?? "Test",
    lastName: anyLead?.lastName ?? "Lead",
    company: anyLead?.company ?? "Acme",
    customFields:
      anyLead?.customFields &&
      typeof anyLead.customFields === "object" &&
      !Array.isArray(anyLead.customFields)
        ? (anyLead.customFields as Record<string, unknown>)
        : {},
  };
  const subject = `[TEST] ${renderTemplate(subjectTemplate, sample)}`;
  const renderedBody = renderTemplate(bodyTemplate, sample).trim();
  const footer =
    `This is a test send from Cold Outreach (variant ${variant ?? "A"}).`;
  const rendered = looksLikeHtml(renderedBody)
    ? `${renderedBody}<p style="margin-top:16px;color:#71717a;font-size:12px;">---<br>${footer}</p>`
    : `${renderedBody}\n\n---\n${footer}`;
  const { text, html } = buildOutboundEmailBodies(rendered, newSentEmailId());

  const info = await sendOutboundMail(oauthAccount, {
    from: oauthAccount.email,
    to,
    subject,
    text,
    html,
  });

  return NextResponse.json({
    ok: true,
    messageId: info.messageId,
    spam,
    via: info.via,
    account: oauthAccount.email,
    oauth: isGoogleOAuthAccount(oauthAccount),
    variant: variant ?? "A",
  });
}
