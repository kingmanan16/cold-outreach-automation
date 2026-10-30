import { geminiChat, type GeminiMessage } from "@/lib/gemini-client";
import {
  buildSystemSnapshot,
  formatSnapshotForPrompt,
  type SystemSnapshot,
} from "@/lib/system-snapshot";
import { prisma } from "@/lib/db";

const PRODUCT_KNOWLEDGE = `
You are the built-in operator assistant for **Cold Outreach** (djasxglobal.vercel.app).
This is NOT generic email advice — answer only for THIS product's behavior.

## Architecture
- **Web app (Vercel)**: campaigns, leads, settings, inbox UI. Does NOT send campaign mail itself.
- **Worker (Railway)**: \`npm run worker\` — sends due emails every ~2 minutes and polls IMAP for replies.
- **Database (Supabase Postgres)**: shared by both.

## Send queue (IMPORTANT)
- Each lead progresses: Mail 1 → follow-up 1 → follow-up 2 → …
- **Follow-ups always send before new Mail 1** when both are due (priority queue).
- Daily **campaign cap** (e.g. 45) applies to all sends that day.
- **sendGapSec** (default 90s) waits between individual sends.
- **maxPerTick** limits how many sends one worker cycle attempts.
- **Sticky mailbox**: follow-ups go from the SAME mailbox that sent Mail 1 (thread continuity).
- **threadFollowUps**: when ON, follow-ups use Re: subject + In-Reply-To headers.

## Step delays
- \`delayDays\` on each step = minimum days AFTER the previous mail (not from Mail 1).
- Example for day 3, 7, 14 from Mail 1: delays 0, 3, 4, 7 on the four steps.

## Common "not sending" causes (check in order)
1. **Global pause** (Settings) or campaign **Paused**
2. **Worker crashed / not running** on Railway — check Deployments → Logs for [sender-tick]
3. **Outside send window** or before scheduled start
4. **Campaign daily cap** reached
5. **Mailbox daily limit** — sticky sender waits for original mailbox
6. **IMAP errors crashing worker** — fix Test IMAP on Accounts; Growcial mailboxes often fail OAuth IMAP
7. **DISABLE_OUTBOUND_MAIL** env on Railway blocks all sends
8. Follow-ups blocked by new mail — FIXED by priority queue; redeploy worker if old code

## Operator actions in the app
- Campaign → **Pause / Active**, **Send now** (queues small batch), **Daily pace** (cap/gap/tick)
- Campaign → Edit → steps, attach leads
- Settings → **Global pause**, bounce thresholds
- Accounts → **Connect Google OAuth**, Test IMAP, pin mailboxes on campaign
- **Resume follow-ups** when sequence was extended after leads finished

## Variables in templates
- {{firstName}}, {{lastName}}, {{company}}, {{email}}
- Any CSV custom field: {{Team Name}}, {{Track}}, etc.

## Replies
- IMAP poller matches replies; interested/not_interested/ooo via Gemini when GEMINI_API_KEY set
- Reply stops remaining follow-ups for that lead

Be concise, actionable, numbered steps when troubleshooting. If snapshot shows data, cite it.
Never invent send counts — use the snapshot only.
`;

export type AssistantTurn = { role: "user" | "assistant"; content: string };

export type AssistantResult =
  | { ok: true; reply: string; snapshot: SystemSnapshot }
  | { ok: false; error: string; fallback?: string };

export async function runAssistantChat(opts: {
  messages: AssistantTurn[];
  campaignId?: string;
}): Promise<AssistantResult> {
  const snapshot = await buildSystemSnapshot(prisma);
  let context = formatSnapshotForPrompt(snapshot);

  if (opts.campaignId) {
    const c = snapshot.campaigns.find((x) => x.id === opts.campaignId);
    if (c) {
      context += `\n\nUser is viewing campaign: "${c.name}" (id ${c.id}).`;
    }
  }

  const systemInstruction = `${PRODUCT_KNOWLEDGE}\n\n--- LIVE SNAPSHOT ---\n${context}`;

  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content.trim()) {
    return { ok: false, error: "Empty message" };
  }

  // Keep last 6 turns for context window discipline
  const recent = opts.messages.slice(-6);
  const geminiMessages: GeminiMessage[] = recent.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    text: m.content,
  }));

  try {
    const reply = await geminiChat(geminiMessages, {
      systemInstruction,
      temperature: 0.25,
      maxOutputTokens: 1200,
    });

    if (reply) {
      return { ok: true, reply, snapshot };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fallback = buildFallbackAnswer(lastUser.content, snapshot);
    return {
      ok: false,
      error: msg,
      fallback,
    };
  }

  return {
    ok: false,
    error: "GEMINI_API_KEY not configured",
    fallback: buildFallbackAnswer(lastUser.content, snapshot),
  };
}

/** Rule-based fallback when Gemini is unavailable — still product-specific */
function buildFallbackAnswer(question: string, snap: SystemSnapshot): string {
  const q = question.toLowerCase();

  if (snap.globalPaused) {
    return "Global pause is ON (Settings). Turn it off, then check Railway worker logs for [sender-tick].";
  }

  if (q.includes("follow") || q.includes("follow-up") || q.includes("followup")) {
    if (snap.totals.dueFollowUps > 0 && snap.totals.dueNewMail > snap.totals.dueFollowUps) {
      return (
        `There are ${snap.totals.dueFollowUps} follow-ups due and ${snap.totals.dueNewMail} new Mail-1 leads waiting. ` +
        `The worker now prioritizes follow-ups first. Redeploy the Railway worker if you still only see new mail going out. ` +
        `Also confirm step delayDays (e.g. 3, 4, 7 for day 3/7/14 schedule).`
      );
    }
    return (
      `Follow-ups send when nextSendAt is due and the campaign is Active. ` +
      `Currently ${snap.totals.dueFollowUps} follow-up(s) due across all campaigns. ` +
      `Check Railway logs and campaign daily cap (${snap.campaigns.map((c) => `${c.name}: ${c.sentToday}/${c.dailyCap}`).join("; ") || "none"}).`
    );
  }

  if (q.includes("not send") || q.includes("why") || q.includes("stuck")) {
    const lines = ["Quick checks:"];
    if (snap.globalPaused) lines.push("1. Global pause is ON — disable in Settings.");
    lines.push("2. Railway worker running? Logs should show [sender-tick] every ~2 min.");
    lines.push("3. Campaign Active + inside send window?");
    lines.push(`4. Due now: ${snap.totals.dueFollowUps} follow-ups, ${snap.totals.dueNewMail} new mail.`);
    lines.push(`5. Mailbox capacity left today: ${snap.totals.mailboxCapacityRemaining}.`);
    return lines.join("\n");
  }

  return (
    `Cold Outreach snapshot: ${snap.totals.dueFollowUps} follow-ups due, ${snap.totals.dueNewMail} new mail due, ` +
    `mailbox capacity ${snap.totals.mailboxCapacityRemaining}. ` +
    `Set GEMINI_API_KEY for full AI answers, or ask about follow-ups, sending, mailboxes, or caps.`
  );
}
