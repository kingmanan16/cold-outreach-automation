/**
 * Keeps a lead's whole sequence in one conversation:
 * every follow-up replies inside Mail 1's thread, from Mail 1's mailbox.
 */

export type PriorSend = {
  messageId: string;
  subject: string;
  stepOrder: number | null;
  accountId?: string;
};

export type ThreadHeaders = {
  /** Message-ID of the most recent mail we sent this lead. */
  inReplyTo: string;
  /** Full chain, oldest first, space separated (RFC 5322). */
  references: string;
  /** Subject of Mail 1 — what the prospect already has in their inbox. */
  rootSubject: string;
};

function normalizeMessageId(id: string | null | undefined): string {
  const t = (id ?? "").trim();
  if (!t) return "";
  return t.startsWith("<") ? t : `<${t}>`;
}

/**
 * Build the reply headers from everything already sent to this lead.
 * Returns null for the first mail of a sequence — nothing to reply to yet.
 */
export function threadHeaders(prior: PriorSend[]): ThreadHeaders | null {
  const ids = prior.map((p) => normalizeMessageId(p.messageId)).filter(Boolean);
  if (ids.length === 0) return null;
  const rootSubject = (prior[0]?.subject ?? "").trim();
  if (!rootSubject) return null;
  return {
    inReplyTo: ids[ids.length - 1],
    references: ids.join(" "),
    rootSubject,
  };
}

/** "Re: X" without ever stacking a second Re:. */
export function replySubject(subject: string): string {
  const s = subject.trim();
  if (!s) return s;
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * The mailbox that must send this lead's next mail: whoever sent Mail 1.
 * Null when nothing has gone out yet — any eligible mailbox may start.
 */
export function originalSenderId(prior: PriorSend[]): string | null {
  return prior[0]?.accountId ?? null;
}

/**
 * Lowest step index that has not been sent yet, so a re-enrolled lead
 * resumes where it actually stopped instead of restarting at Mail 1.
 * Returns totalSteps when the whole sequence is genuinely done.
 */
export function firstUnsentStep(
  prior: Array<{ stepOrder: number | null }>,
  totalSteps: number
): number {
  const sent = new Set(
    prior
      .map((p) => p.stepOrder)
      .filter((s): s is number => typeof s === "number")
  );
  for (let i = 0; i < totalSteps; i++) {
    if (!sent.has(i)) return i;
  }
  return totalSteps;
}
