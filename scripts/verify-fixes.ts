import assert from "assert";
import { getCampaignDeferReason } from "../lib/send-window";
import { pickAbVariant } from "../lib/ab-variant";
import {
  nextLeadStatusAfterSend,
  leadStatusBlocksSending,
} from "../lib/lead-sending";
import { CampaignLeadStatus, LeadStatus } from "@prisma/client";
import {
  clampMaxPerTick,
  clampSendGapSec,
  nextFollowUpAt,
} from "../lib/send-pacing";
import {
  firstUnsentStep,
  originalSenderId,
  replySubject,
  threadHeaders,
} from "../lib/thread-continuity";
import { progressLabel, sequenceUiStatus } from "../lib/sequence-labels";

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const camp = {
  status: "ACTIVE",
  timezone: "Asia/Kolkata",
  scheduledStartAt: future,
  sendWindowStartMin: 9 * 60,
  sendWindowEndMin: 18 * 60,
  sendDays: [1, 2, 3, 4, 5],
};

assert.strictEqual(
  getCampaignDeferReason(camp, new Date()),
  "BEFORE_START",
  "future start should defer"
);
assert.strictEqual(
  getCampaignDeferReason(camp, new Date(), { bypassWindow: true }),
  null,
  "bypass should skip BEFORE_START"
);

const bodyOnly = pickAbVariant({
  subject: "Sub A",
  body: "Body A",
  bodyB: "Body B",
});
assert.ok(bodyOnly.variant === "A" || bodyOnly.variant === "B");
if (bodyOnly.variant === "B") {
  assert.strictEqual(bodyOnly.bodyTemplate, "Body B");
  assert.strictEqual(bodyOnly.subjectTemplate, "Sub A");
}

assert.strictEqual(nextLeadStatusAfterSend(LeadStatus.NEW), LeadStatus.CONTACTED);
assert.strictEqual(nextLeadStatusAfterSend(LeadStatus.INTERESTED), null);
assert.strictEqual(leadStatusBlocksSending(LeadStatus.WON), true);
assert.strictEqual(leadStatusBlocksSending(LeadStatus.CONTACTED), false);

assert.strictEqual(clampSendGapSec(90), 90);
assert.strictEqual(clampSendGapSec(5), 15);
assert.strictEqual(clampMaxPerTick(100), 50);
const follow = nextFollowUpAt(new Date("2026-08-14T10:00:00Z"), 0);
assert.ok(follow.getTime() >= new Date("2026-08-15T10:00:00Z").getTime());

console.log("verify-fixes: all assertions passed");

// --- thread continuity -------------------------------------------------
assert.strictEqual(
  threadHeaders([]),
  null,
  "mail 1 has nothing to reply to"
);
const th = threadHeaders([
  { messageId: "a@x", subject: "Quick intro", stepOrder: 0 },
  { messageId: "<b@x>", subject: "Following up", stepOrder: 1 },
]);
assert.ok(th);
assert.strictEqual(th.inReplyTo, "<b@x>", "reply to the most recent mail");
assert.strictEqual(th.references, "<a@x> <b@x>", "full chain, oldest first");
assert.strictEqual(th.rootSubject, "Quick intro", "thread keeps mail 1 subject");
assert.strictEqual(replySubject("Quick intro"), "Re: Quick intro");
assert.strictEqual(replySubject("Re: Quick intro"), "Re: Quick intro", "no stacking");
assert.strictEqual(originalSenderId([]), null);
assert.strictEqual(
  originalSenderId([
    { messageId: "a", subject: "s", stepOrder: 0, accountId: "acct-1" },
    { messageId: "b", subject: "s", stepOrder: 1, accountId: "acct-2" },
  ]),
  "acct-1",
  "the mailbox that sent mail 1 owns the thread"
);

// --- resume point ------------------------------------------------------
assert.strictEqual(
  firstUnsentStep([{ stepOrder: 0 }], 4),
  1,
  "a lead that only got mail 1 resumes at follow-up 1"
);
assert.strictEqual(
  firstUnsentStep([{ stepOrder: 0 }, { stepOrder: 1 }], 2),
  2,
  "genuinely finished sequences report done"
);
assert.strictEqual(
  firstUnsentStep([{ stepOrder: 1 }], 3),
  0,
  "resumes at the earliest gap, not the end"
);

// --- progress is counted, never inferred -------------------------------
assert.strictEqual(
  progressLabel({
    sentCount: 1,
    status: CampaignLeadStatus.COMPLETED,
    totalSteps: 2,
  }),
  "Behind · 1 of 2 sent",
  "adding a follow-up must not read as Done 2 of 2"
);
assert.strictEqual(
  progressLabel({
    sentCount: 2,
    status: CampaignLeadStatus.COMPLETED,
    totalSteps: 2,
  }),
  "Done · 2 of 2"
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
assert.strictEqual(
  sequenceUiStatus({
    status: CampaignLeadStatus.COMPLETED,
    nextSendAt: null,
    sentCount: 2,
    totalSteps: 2,
  }),
  "finished"
);

console.log("verify-fixes: thread + progress assertions passed");

import {
  buildOutboundEmailBodies,
  looksLikeHtml,
  rewriteHtmlHrefsForTracking,
} from "../lib/tracking";

assert.strictEqual(looksLikeHtml("Hi there\n\nPlain text"), false);
assert.strictEqual(
  looksLikeHtml('<p>Hi</p><a href="https://example.com/rsvp">RSVP</a>'),
  true
);
assert.strictEqual(
  looksLikeHtml('<img src="https://cdn.example.com/banner.png" alt="Banner" />'),
  true
);

const htmlBodies = buildOutboundEmailBodies(
  `Hi Alex<br><br>
<a href="https://forms.example.com/rsvp" style="background:#0f766e;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;display:inline-block;">RSVP</a><br><br>
<a href="https://maps.google.com/?q=Delhi">Open map</a><br><br>
<img src="https://cdn.example.com/invite.png" width="480" alt="Invite" />`,
  "sent-html-1"
);
assert.ok(
  htmlBodies.html.includes('src="https://cdn.example.com/invite.png"'),
  "img src must stay direct (not click-tracked)"
);
assert.ok(
  htmlBodies.html.includes("/api/track/click/sent-html-1?url="),
  "RSVP / map hrefs should be click-tracked"
);
assert.ok(
  !htmlBodies.html.includes("&lt;a href"),
  "HTML tags must not be escaped"
);
assert.ok(
  htmlBodies.text.includes("RSVP (") &&
    htmlBodies.text.includes("/api/track/click/sent-html-1"),
  "plain part keeps RSVP label and tracks the URL"
);
assert.ok(
  !htmlBodies.text.includes("<a ") && !htmlBodies.text.includes("<img "),
  "plain part must not contain raw HTML tags"
);

const plainBodies = buildOutboundEmailBodies(
  "Hi\n\nSee https://example.com/x\n",
  "sent-plain-1"
);
assert.ok(
  plainBodies.html.includes("white-space:pre-wrap"),
  "plain templates still use the old HTML wrapper"
);
assert.ok(
  rewriteHtmlHrefsForTracking(
    '<a href="https://a.com">A</a>',
    "id1"
  ).includes("/api/track/click/id1?url="),
  "href rewriter works"
);

console.log("verify-fixes: HTML email assertions passed");

import { renderTemplate } from "../lib/template";

assert.strictEqual(
  renderTemplate("Hi {{firstName}} @ {{company}}", {
    firstName: "A",
    company: "Co",
  }),
  "Hi A @ Co"
);
assert.strictEqual(
  renderTemplate("Team {{Team Name}} · {{Serial}} · {{Track}}", {
    firstName: "X",
    customFields: {
      "Team Name": "AI Bros",
      Serial: "AIM-002",
      Track: "AI for Supply Chain",
    },
  }),
  "Team AI Bros · AIM-002 · AI for Supply Chain"
);
assert.strictEqual(
  renderTemplate("{{teamName}} / {{team_name}}", {
    customFields: { "Team Name": "A2 Hack" },
  }),
  "A2 Hack / A2 Hack",
  "normalized aliases for spaced custom fields"
);
assert.strictEqual(
  renderTemplate("{{email}}", { email: "a@b.com" }),
  "a@b.com"
);

console.log("verify-fixes: custom field template assertions passed");

import {
  compareDueCampaignLeads,
  describeSendQueueMix,
  sendQueueTier,
  sortDueCampaignLeads,
} from "../lib/send-queue";

assert.strictEqual(sendQueueTier(0), 1, "mail 1 is lower priority tier");
assert.strictEqual(sendQueueTier(1), 0, "follow-up is top tier");
assert.strictEqual(sendQueueTier(3), 0);

const oldAttach = new Date("2026-08-01T10:00:00Z");
const newerFu = new Date("2026-08-20T10:00:00Z");

assert.ok(
  compareDueCampaignLeads(
    { currentStep: 1, nextSendAt: newerFu },
    { currentStep: 0, nextSendAt: oldAttach }
  ) < 0,
  "follow-up must sort before new mail even when new mail has older nextSendAt"
);

const sorted = sortDueCampaignLeads([
  { id: "new", currentStep: 0, nextSendAt: oldAttach },
  { id: "fu", currentStep: 1, nextSendAt: newerFu },
  { id: "new2", currentStep: 0, nextSendAt: new Date("2026-08-02T10:00:00Z") },
] as Array<{ id: string; currentStep: number; nextSendAt: Date }>);

assert.strictEqual(sorted[0].id, "fu", "only follow-up first");
assert.strictEqual(sorted[1].id, "new", "then oldest new mail");
assert.strictEqual(sorted[2].id, "new2");

const mix = describeSendQueueMix([
  { currentStep: 1, nextSendAt: newerFu },
  { currentStep: 0, nextSendAt: oldAttach },
  { currentStep: 2, nextSendAt: newerFu },
]);
assert.strictEqual(mix.followUpDue, 2);
assert.strictEqual(mix.newMailDue, 1);

console.log("verify-fixes: send queue priority assertions passed");
