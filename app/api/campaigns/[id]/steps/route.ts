import { NextResponse } from "next/server";
import { CampaignLeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkEmailContent } from "@/lib/spam-check";
import { findReEnrollCandidates } from "@/lib/re-enroll";

type StepInput = {
  subject: string;
  subjectB?: string | null;
  body: string;
  bodyB?: string | null;
  delayDays: number;
  winner?: string | null;
};

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json();
  const steps = body.steps as StepInput[] | undefined;

  if (!Array.isArray(steps)) {
    return NextResponse.json({ error: "steps array is required" }, { status: 400 });
  }

  const spamReports = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!String(step.subject ?? "").trim() || !String(step.body ?? "").trim()) {
      return NextResponse.json(
        { error: `Step ${i + 1} needs subject and body` },
        { status: 400 }
      );
    }
    if (!Number.isFinite(Number(step.delayDays)) || Number(step.delayDays) < 0) {
      return NextResponse.json(
        { error: `Step ${i + 1} has invalid delayDays` },
        { status: 400 }
      );
    }
    const spam = checkEmailContent(String(step.subject), String(step.body));
    if (!spam.ok) {
      return NextResponse.json(
        { error: `Step ${i + 1}: ${spam.blockers.join("; ")}`, spam },
        { status: 400 }
      );
    }
    spamReports.push({ step: i + 1, warnings: spam.warnings });
  }

  await prisma.$transaction(async (tx) => {
    await tx.campaignStep.deleteMany({ where: { campaignId: params.id } });
    if (steps.length > 0) {
      await tx.campaignStep.createMany({
        data: steps.map((step, index) => ({
          campaignId: params.id,
          stepOrder: index,
          delayDays: Number(step.delayDays),
          subject: String(step.subject).trim(),
          subjectB: step.subjectB?.trim() ? String(step.subjectB).trim() : null,
          body: String(step.body).trim(),
          bodyB: step.bodyB?.trim() ? String(step.bodyB).trim() : null,
          winner: step.winner === "A" || step.winner === "B" ? step.winner : null,
        })),
      });
    }
  });

  const updated = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: { steps: { orderBy: { stepOrder: "asc" } } },
  });

  // stepOrder is positional, so leads mid-sequence now point at whatever mail
  // landed on their index. Report both numbers so the UI can say so plainly.
  const [midSequence, reEnrollable] = await Promise.all([
    prisma.campaignLead.count({
      where: {
        campaignId: params.id,
        status: CampaignLeadStatus.ACTIVE,
        currentStep: { gt: 0 },
      },
    }),
    findReEnrollCandidates(params.id),
  ]);

  return NextResponse.json({
    ...updated,
    spamReports,
    midSequence,
    reEnrollable: reEnrollable.length,
  });
}
