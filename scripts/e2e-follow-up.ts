/**
 * End-to-end check of the follow-up path against a real Postgres database.
 *
 * Reproduces the exact production situation: a campaign with one mail whose
 * leads have all been sent and marked COMPLETED, then a follow-up is added.
 *
 * Run against a THROWAWAY database only — it writes and deletes rows:
 *   DATABASE_URL=postgresql://... npx tsx scripts/e2e-follow-up.ts
 */
import assert from "assert";
import { CampaignLeadStatus, CampaignStatus, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pickAccount } from "@/lib/mailbox-picker";
import { findReEnrollCandidates } from "@/lib/re-enroll";
import { threadHeaders, replySubject } from "@/lib/thread-continuity";
import { progressLabel, sequenceUiStatus } from "@/lib/sequence-labels";
import { PUT as putSteps } from "@/app/api/campaigns/[id]/steps/route";
import { POST as postReEnroll } from "@/app/api/campaigns/[id]/re-enroll/route";
import { GET as getDiagnostics } from "@/app/api/campaigns/[id]/diagnostics/route";
import { POST as postSendNow } from "@/app/api/campaigns/[id]/send-now/route";
import { DELETE as deleteLeads } from "@/app/api/campaigns/[id]/attach-list/route";

const pass: string[] = [];
function ok(label: string) {
  pass.push(label);
  console.log(`  PASS  ${label}`);
}

function get() {
  return new Request("http://localhost/test");
}

function req(body: unknown, method = "POST") {
  return new Request("http://localhost/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function wipe() {
  await prisma.sentEmail.deleteMany({});
  await prisma.campaignLead.deleteMany({});
  await prisma.campaignAccount.deleteMany({});
  await prisma.campaignStep.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.leadList.deleteMany({});
  await prisma.emailAccount.deleteMany({});
  await prisma.suppression.deleteMany({});
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  assert.ok(
    /localhost|127\.0\.0\.1/.test(url),
    "refusing to run: DATABASE_URL must point at a local throwaway database"
  );
  await wipe();

  // ---------------------------------------------------------------- seed
  const mailboxA = await prisma.emailAccount.create({
    data: {
      email: "sender-a@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "sender-a@example.com",
      smtpPassEnc: "enc",
      imapHost: "imap.example.com",
      imapPort: 993,
      imapUser: "sender-a@example.com",
      imapPassEnc: "enc",
      dailyLimit: 50,
      sentToday: 3,
      createdAt: new Date("2026-01-01"),
    },
  });
  const mailboxB = await prisma.emailAccount.create({
    data: {
      email: "sender-b@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "sender-b@example.com",
      smtpPassEnc: "enc",
      imapHost: "imap.example.com",
      imapPort: 993,
      imapUser: "sender-b@example.com",
      imapPassEnc: "enc",
      dailyLimit: 50,
      sentToday: 0, // least-loaded: the old code would have picked this one
      createdAt: new Date("2026-01-02"),
    },
  });

  const list = await prisma.leadList.create({ data: { name: "Test list" } });
  const campaign = await prisma.campaign.create({
    data: {
      name: "First",
      status: CampaignStatus.ACTIVE,
      dailyCap: 45,
      maxPerTick: 5,
      sendWindowStartMin: 0,
      sendWindowEndMin: 1439,
      sendDays: [0, 1, 2, 3, 4, 5, 6],
      steps: {
        create: [
          { stepOrder: 0, delayDays: 0, subject: "Quick intro", body: "Hi {{firstName}}" },
        ],
      },
    },
  });

  const emails = ["a@corp.com", "b@corp.com", "c@corp.com", "replied@corp.com", "gone@corp.com"];
  const leads: Array<{ id: string; email: string }> = [];
  for (const email of emails) {
    leads.push(
      await prisma.lead.create({
        data: { email, firstName: "Alex", company: "Corp", listId: list.id },
      })
    );
  }

  // Mail 1 already went out from mailbox A to everyone, so every lead is
  // COMPLETED with nextSendAt null — exactly the stuck state in production.
  let n = 0;
  for (const lead of leads) {
    await prisma.sentEmail.create({
      data: {
        leadId: lead.id,
        accountId: mailboxA.id,
        campaignId: campaign.id,
        stepOrder: 0,
        subject: "Quick intro",
        messageId: `<mail1-${n++}@example.com>`,
        sentAt: new Date("2026-08-14T04:00:00Z"),
      },
    });
    await prisma.campaignLead.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        currentStep: 1,
        status: CampaignLeadStatus.COMPLETED,
        nextSendAt: null,
        lastMessageId: `<mail1-${n - 1}@example.com>`,
      },
    });
  }

  // One lead replied, one unsubscribed — neither may ever be pulled back in.
  await prisma.campaignLead.updateMany({
    where: { campaignId: campaign.id, leadId: leads[3].id },
    data: { status: CampaignLeadStatus.REPLIED },
  });
  await prisma.lead.update({
    where: { id: leads[4].id },
    data: { status: LeadStatus.UNSUBSCRIBED },
  });

  console.log("\n1. Before the follow-up exists");
  let cands = await findReEnrollCandidates(campaign.id);
  assert.strictEqual(cands.length, 0, "a 1-mail sequence has nobody behind it");
  ok("nobody is 'behind' while the sequence is still 1 mail");

  console.log("\n2. Add the follow-up through the real steps API");
  const stepsRes = await putSteps(
    req({
      steps: [
        { subject: "Quick intro", body: "Hi {{firstName}}", delayDays: 0 },
        { subject: "Following up", body: "Bumping this, {{firstName}}", delayDays: 3 },
      ],
    }, "PUT"),
    { params: { id: campaign.id } }
  );
  const stepsBody = await stepsRes.json();
  assert.strictEqual(stepsRes.status, 200, JSON.stringify(stepsBody));
  assert.strictEqual(stepsBody.steps.length, 2);
  assert.strictEqual(
    stepsBody.reEnrollable,
    3,
    `expected 3 re-enrollable (not the replied or unsubscribed one), got ${stepsBody.reEnrollable}`
  );
  ok("saving the follow-up reports exactly 3 leads needing a resume");
  ok("replied + unsubscribed leads are excluded from the resume count");

  console.log("\n3. The UI must not claim these leads are done");
  assert.strictEqual(
    progressLabel({ sentCount: 1, status: CampaignLeadStatus.COMPLETED, totalSteps: 2 }),
    "Behind · 1 of 2 sent"
  );
  assert.strictEqual(
    sequenceUiStatus({
      status: CampaignLeadStatus.COMPLETED,
      nextSendAt: null,
      sentCount: 1,
      totalSteps: 2,
    }),
    "behind"
  );
  ok("progress reads 'Behind · 1 of 2 sent', never 'Done · 2 of 2'");

  console.log("\n4. Diagnostics names the real reason");
  const diagRes = await getDiagnostics(get(), { params: { id: campaign.id } });
  const diag = await diagRes.json();
  assert.strictEqual(diag.idleReason, "LEADS_BEHIND_SEQUENCE", `got ${diag.idleReason}`);
  assert.strictEqual(diag.reEnrollable, 3);
  assert.strictEqual(diag.threadFollowUps, true, "threading defaults on");
  ok("diagnostics reports LEADS_BEHIND_SEQUENCE with a count, not a vague label");

  console.log("\n5. Resume through the real re-enroll API");
  const reRes = await postReEnroll(req({}), { params: { id: campaign.id } });
  const reBody = await reRes.json();
  assert.strictEqual(reBody.reEnrolled, 3, JSON.stringify(reBody));
  const resumed = await prisma.campaignLead.findMany({
    where: { campaignId: campaign.id, status: CampaignLeadStatus.ACTIVE },
  });
  assert.strictEqual(resumed.length, 3);
  for (const r of resumed) {
    assert.strictEqual(r.currentStep, 1, "must resume at follow-up 1, not restart at mail 1");
    assert.ok(r.nextSendAt, "must become due");
  }
  ok("3 leads back to ACTIVE at step 1 (follow-up), never restarted at mail 1");

  const stillStopped = await prisma.campaignLead.findFirst({
    where: { campaignId: campaign.id, leadId: leads[3].id },
  });
  assert.strictEqual(stillStopped?.status, CampaignLeadStatus.REPLIED);
  const unsub = await prisma.campaignLead.findFirst({
    where: { campaignId: campaign.id, leadId: leads[4].id },
  });
  assert.strictEqual(unsub?.status, CampaignLeadStatus.COMPLETED, "unsubscribed stays put");
  ok("replied lead stays REPLIED, unsubscribed lead is never revived");

  console.log("\n6. Mailbox stickiness — the whole point");
  const pick = await pickAccount(prisma, campaign.id, leads[0].id);
  assert.ok(pick.ok, "should have a mailbox");
  assert.strictEqual(
    pick.account.id,
    mailboxA.id,
    `follow-up must come from ${mailboxA.email}, got ${pick.ok ? pick.account.email : "none"}`
  );
  assert.strictEqual(pick.sticky, true);
  ok(`follow-up sends from ${mailboxA.email} even though ${mailboxB.email} is emptier`);

  // Fill mailbox A right up: we must WAIT for it, not silently switch to B.
  await prisma.emailAccount.update({
    where: { id: mailboxA.id },
    data: { sentToday: 50 },
  });
  const busy = await pickAccount(prisma, campaign.id, leads[0].id);
  assert.strictEqual(busy.ok, false);
  assert.strictEqual(
    (busy as { reason: string }).reason,
    "ORIGINAL_MAILBOX_BUSY",
    "a full original mailbox must hold the lead, not hand it to another sender"
  );
  ok("original mailbox full -> lead waits, sender is NOT switched");

  // Disabled for good: nothing to wait for, so falling back is correct.
  await prisma.emailAccount.update({
    where: { id: mailboxA.id },
    data: { sentToday: 0, disabled: true },
  });
  const fallback = await pickAccount(prisma, campaign.id, leads[0].id);
  assert.ok(fallback.ok);
  assert.strictEqual(fallback.account.id, mailboxB.id);
  assert.strictEqual(fallback.sticky, false);
  ok("original mailbox disabled for good -> falls back to another, flagged non-sticky");

  await prisma.emailAccount.update({
    where: { id: mailboxA.id },
    data: { disabled: false, sentToday: 3 },
  });

  console.log("\n7. Pinned mailboxes are a hard restriction");
  await prisma.campaignAccount.create({
    data: { campaignId: campaign.id, accountId: mailboxA.id },
  });
  await prisma.emailAccount.update({
    where: { id: mailboxA.id },
    data: { disabled: true },
  });
  const pinnedOnly = await pickAccount(prisma, campaign.id, leads[1].id);
  assert.strictEqual(pinnedOnly.ok, false);
  assert.strictEqual((pinnedOnly as { reason: string }).reason, "NO_CAPACITY");
  ok("a pinned-but-unavailable mailbox never leaks the send to an unpinned one");
  await prisma.emailAccount.update({
    where: { id: mailboxA.id },
    data: { disabled: false },
  });
  await prisma.campaignAccount.deleteMany({ where: { campaignId: campaign.id } });

  console.log("\n8. Threading headers from real rows");
  const prior = await prisma.sentEmail.findMany({
    where: { campaignId: campaign.id, leadId: leads[0].id, bounced: false, isManualReply: false },
    orderBy: { sentAt: "asc" },
    select: { messageId: true, subject: true, stepOrder: true, accountId: true },
  });
  const th = threadHeaders(prior);
  assert.ok(th);
  assert.strictEqual(th.inReplyTo, "<mail1-0@example.com>");
  assert.strictEqual(th.references, "<mail1-0@example.com>");
  assert.strictEqual(replySubject(th.rootSubject), "Re: Quick intro");
  ok("follow-up replies to mail 1's Message-ID with subject 'Re: Quick intro'");

  console.log("\n9. Duplicate guard");
  await prisma.sentEmail.create({
    data: {
      leadId: leads[0].id,
      accountId: mailboxA.id,
      campaignId: campaign.id,
      stepOrder: 1,
      subject: "Re: Quick intro",
      messageId: "<mail2-0@example.com>",
      inReplyToMessageId: "<mail1-0@example.com>",
      sentAt: new Date(),
    },
  });
  await prisma.campaignLead.updateMany({
    where: { campaignId: campaign.id, leadId: leads[0].id },
    data: { status: CampaignLeadStatus.COMPLETED, currentStep: 2, nextSendAt: null },
  });
  cands = await findReEnrollCandidates(campaign.id);
  assert.ok(
    !cands.some((c) => c.leadId === leads[0].id),
    "a lead that received both mails is genuinely finished"
  );
  ok("a fully-sent lead is not offered for resume again");

  console.log("\n10. Suppression is honoured");
  await prisma.suppression.create({ data: { email: "b@corp.com" } });
  await prisma.campaignLead.updateMany({
    where: { campaignId: campaign.id, leadId: leads[1].id },
    data: { status: CampaignLeadStatus.COMPLETED, currentStep: 1, nextSendAt: null },
  });
  cands = await findReEnrollCandidates(campaign.id);
  assert.ok(
    !cands.some((c) => c.email === "b@corp.com"),
    "suppressed address must never be re-enrolled"
  );
  ok("suppressed address is never re-enrolled");

  console.log("\n11. Send-now respects the per-cycle limit");
  await prisma.campaignLead.updateMany({
    where: { campaignId: campaign.id },
    data: { status: CampaignLeadStatus.ACTIVE, nextSendAt: new Date() },
  });
  const snRes = await postSendNow(req({}), { params: { id: campaign.id } });
  const sn = await snRes.json();
  assert.strictEqual(sn.limit, 5);
  assert.ok(sn.updated <= 5, `queued ${sn.updated}, must not exceed maxPerTick`);
  ok(`send-now queued ${sn.updated} lead(s), capped at maxPerTick=5`);

  console.log("\n12. Bulk remove from campaign");
  const delRes = await deleteLeads(
    req({ leadIds: [leads[3].id, leads[4].id] }, "DELETE"),
    { params: { id: campaign.id } }
  );
  const del = await delRes.json();
  assert.strictEqual(del.removed, 2);
  const remaining = await prisma.campaignLead.count({ where: { campaignId: campaign.id } });
  assert.strictEqual(remaining, 3);
  ok("bulk remove deletes exactly the selected leads");

  const history = await prisma.sentEmail.count({ where: { leadId: leads[3].id } });
  assert.strictEqual(history, 1, "removing from a campaign must not erase send history");
  ok("send history survives removal from the campaign");

  await wipe();
  console.log(`\n${pass.length} end-to-end checks passed.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nFAILED:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
