import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const reminderAt =
    body.reminderAt === null || body.reminderAt === ""
      ? null
      : new Date(String(body.reminderAt));

  if (reminderAt && Number.isNaN(reminderAt.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: { reminderAt },
    select: { id: true, reminderAt: true },
  });

  return NextResponse.json(lead);
}
