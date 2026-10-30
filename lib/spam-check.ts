const SPAMMY = [
  "act now",
  "limited time",
  "congratulations",
  "click here",
  "free money",
  "guaranteed",
  "no obligation",
  "winner",
  "risk-free",
  "buy now",
];

export type SpamCheckResult = {
  ok: boolean;
  warnings: string[];
  blockers: string[];
};

export function checkEmailContent(subject: string, body: string): SpamCheckResult {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const text = `${subject}\n${body}`.toLowerCase();

  for (const phrase of SPAMMY) {
    if (text.includes(phrase)) warnings.push(`Spammy phrase: "${phrase}"`);
  }

  const capsRatio =
    subject.length > 0
      ? (subject.replace(/[^A-Z]/g, "").length / subject.replace(/[^A-Za-z]/g, "").length || 1)
      : 0;
  if (capsRatio > 0.6 && subject.replace(/[^A-Za-z]/g, "").length > 8) {
    warnings.push("Subject is mostly ALL CAPS");
  }

  const links = body.match(/https?:\/\/[^\s]+/gi) ?? [];
  if (links.length > 5) warnings.push(`Too many links (${links.length})`);

  // The sender stopped appending a footer, so this is now the only opt-out
  // the recipient will ever get — say so instead of promising a footer.
  if (!/unsubscribe/i.test(body)) {
    warnings.push(
      "No opt-out in the body — campaign mail no longer gets an automatic unsubscribe footer"
    );
  }

  if (!subject.trim()) blockers.push("Subject is empty");
  if (!body.trim()) blockers.push("Body is empty");

  return { ok: blockers.length === 0, warnings, blockers };
}
