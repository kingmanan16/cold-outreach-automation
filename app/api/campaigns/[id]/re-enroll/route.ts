import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findReEnrollCandidates, reEnroll } from "@/lib/re-enroll";

/** How many leads are behind the current sequence — drives the banner. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const candidates = await findReEnrollCandidates(params.id);
  return NextResponse.json({
    count: candidates.length,
    sample: candidates.slice(0, 5).map((c) => c.email),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const leadIds: string[] | undefined = Array.isArray(body.leadIds)
    ? body.leadIds.map(String)
    : undefined;

  const candidates = await findReEnrollCandidates(params.id, leadIds);
  const updated = await reEnroll(candidates);

  return NextResponse.json({
    reEnrolled: updated,
    requested: leadIds?.length ?? null,
    resumeSteps: candidates.map((c) => ({
      email: c.email,
      resumeStep: c.resumeStep,
    })),
  });
}
