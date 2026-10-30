export type AbStep = {
  subject: string;
  subjectB?: string | null;
  body: string;
  bodyB?: string | null;
  winner?: string | null;
};

/**
 * Pick a single A/B variant for subject + body together (one coin flip).
 * Body-B alone (no subjectB) is still eligible for the random B arm.
 */
export function pickAbVariant(step: AbStep): {
  variant: "A" | "B" | null;
  subjectTemplate: string;
  bodyTemplate: string;
} {
  const hasSubjectB = Boolean(step.subjectB?.trim());
  const hasBodyB = Boolean(step.bodyB?.trim());
  const hasB = hasSubjectB || hasBodyB;

  let variant: "A" | "B" | null = null;
  if (step.winner === "A" || step.winner === "B") {
    variant = step.winner;
  } else if (hasB) {
    variant = Math.random() < 0.5 ? "A" : "B";
  }

  if (variant === "B") {
    return {
      variant,
      subjectTemplate: hasSubjectB ? step.subjectB! : step.subject,
      bodyTemplate: hasBodyB ? step.bodyB! : step.body,
    };
  }

  return {
    variant: hasB ? "A" : null,
    subjectTemplate: step.subject,
    bodyTemplate: step.body,
  };
}
