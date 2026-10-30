/**
 * Prompt 10 verify: send tracked email, hit open/click, note + reminder.
 */
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";
import { decrypt } from "../lib/encryption";
import {
  buildTrackedHtmlEmail,
  encodeTrackUrl,
  getAppBaseUrl,
  newSentEmailId,
  rewriteLinksForTracking,
} from "../lib/tracking";

const prisma = new PrismaClient();
const APP = getAppBaseUrl();

async function main() {
  const account = await prisma.emailAccount.findFirst({
    orderBy: { sentToday: "asc" },
  });
  if (!account) throw new Error("No email account");

  let lead = await prisma.lead.findUnique({
    where: { email: account.email },
  });
  if (!lead) {
    const list =
      (await prisma.leadList.findFirst()) ??
      (await prisma.leadList.create({ data: { name: "Verify list" } }));
    lead = await prisma.lead.create({
      data: {
        email: account.email,
        firstName: "Verify",
        listId: list.id,
      },
    });
  }

  const sentEmailId = newSentEmailId();
  const linkTarget = "https://example.com/tracking-verify";
  const plainBody = `Hi {{firstName}},\n\nPlease open this and click: ${linkTarget}\n\nThanks`;
  const body = plainBody.replace("{{firstName}}", lead.firstName || "there");
  const subject = `[Track verify] ${new Date().toISOString()}`;
  const text = rewriteLinksForTracking(body, sentEmailId);
  const html = buildTrackedHtmlEmail({ textBody: body, sentEmailId });

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: {
      user: account.smtpUser,
      pass: decrypt(account.smtpPassEnc),
    },
  });

  const info = await transporter.sendMail({
    from: account.email,
    to: lead.email,
    subject,
    text,
    html,
  });

  const messageId = info.messageId;
  if (!messageId) throw new Error("No messageId from SMTP");

  await prisma.sentEmail.create({
    data: {
      id: sentEmailId,
      leadId: lead.id,
      accountId: account.id,
      subject,
      subjectVariant: "A",
      messageId,
      sentAt: new Date(),
    },
  });

  console.log("sent", { sentEmailId, messageId, to: lead.email });

  // Open pixel
  const openRes = await fetch(`${APP}/api/track/open/${sentEmailId}`);
  const openCt = openRes.headers.get("content-type") || "";
  console.log("open_status", openRes.status, openCt);
  if (!openRes.ok || !openCt.includes("image/gif")) {
    throw new Error("Open tracking failed");
  }

  const afterOpen = await prisma.sentEmail.findUnique({
    where: { id: sentEmailId },
  });
  if (!afterOpen?.opened) throw new Error("SentEmail.opened not true");
  console.log("opened_ok", true);

  // Click redirect
  const encoded = encodeTrackUrl(linkTarget);
  const clickRes = await fetch(
    `${APP}/api/track/click/${sentEmailId}?url=${encoded}`,
    { redirect: "manual" }
  );
  const location = clickRes.headers.get("location");
  console.log("click_status", clickRes.status, "location", location);
  if (clickRes.status !== 302 || location !== linkTarget) {
    throw new Error("Click tracking redirect failed");
  }

  const afterClick = await prisma.sentEmail.findUnique({
    where: { id: sentEmailId },
  });
  if (!afterClick?.clicked) throw new Error("SentEmail.clicked not true");
  console.log("clicked_ok", true);

  // Note
  const note = await prisma.note.create({
    data: {
      leadId: lead.id,
      content: `Verify note ${new Date().toISOString()}`,
    },
  });
  const notes = await prisma.note.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  if (notes[0]?.id !== note.id) throw new Error("Note did not persist");
  console.log("note_ok", notes[0].content);

  // Reminder due today
  const reminderAt = new Date();
  reminderAt.setHours(12, 0, 0, 0);
  await prisma.lead.update({
    where: { id: lead.id },
    data: { reminderAt },
  });
  const withReminder = await prisma.lead.findUnique({ where: { id: lead.id } });
  if (!withReminder?.reminderAt) throw new Error("Reminder did not persist");
  console.log("reminder_ok", withReminder.reminderAt.toISOString());

  console.log("VERIFY_PASS");
}

main()
  .catch((e) => {
    console.error("VERIFY_FAIL", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
