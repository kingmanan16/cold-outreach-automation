import { NextResponse } from "next/server";
import { CampaignLeadStatus, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendOutboundMail } from "@/lib/mail-send";
import { recordLeadEvent } from "@/lib/lead-events";
import { newSentEmailId } from "@/lib/tracking";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const reply = await prisma.reply.findUnique({
    where: { id: params.id },
    include: { lead: true, account: true },
  });
  if (!reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  const body = await request.json();
  const text = String(body.body ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  const account = reply.account;

  const prior = await prisma.sentEmail.findFirst({
    where: {
      leadId: reply.leadId,
      isManualReply: false,
      bounced: false,
    },
    orderBy: { sentAt: "desc" },
    select: { subject: true },
  });
  const baseSubject = prior?.subject?.replace(/^Re:\s*/i, "").trim();
  const subject = baseSubject ? `Re: ${baseSubject}` : `Re: your email`;

  const refs = reply.messageId
    ? `<${reply.messageId.replace(/^<|>$/g, "")}>`
    : undefined;

  let info;
  try {
    info = await sendOutboundMail(account, {
      from: account.displayName
        ? `"${account.displayName}" <${account.email}>`
        : account.email,
      to: reply.lead.email,
      subject,
      text,
      inReplyTo: refs,
      references: refs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const messageId = info.messageId;

  await prisma.$transaction(async (tx) => {
    await tx.sentEmail.create({
      data: {
        id: newSentEmailId(),
        leadId: reply.leadId,
        accountId: account.id,
        subject,
        messageId,
        isManualReply: true,
        inReplyToMessageId: reply.messageId,
      },
    });
    await tx.campaignLead.updateMany({
      where: { leadId: reply.leadId, status: CampaignLeadStatus.ACTIVE },
      data: { status: CampaignLeadStatus.STOPPED, nextSendAt: null },
    });
    if (body.markInterested) {
      await tx.lead.update({
        where: { id: reply.leadId },
        data: { status: LeadStatus.INTERESTED },
      });
    }
    await tx.reply.update({
      where: { id: reply.id },
      data: { readAt: new Date() },
    });
  });

  await recordLeadEvent(reply.leadId, "manual_reply_sent", {
    replyId: reply.id,
    messageId,
    subject,
    via: info.via,
  });

  return NextResponse.json({ ok: true, messageId, via: info.via });
}
