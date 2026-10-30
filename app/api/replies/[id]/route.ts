import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json().catch(() => ({}));
  const data: { readAt?: Date | null; snoozedUntil?: Date | null; category?: string } =
    {};

  if (body.read === true) data.readAt = new Date();
  if (body.read === false) data.readAt = null;
  if (body.snoozedUntil !== undefined) {
    data.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
  }
  if (body.category !== undefined) data.category = String(body.category);

  const reply = await prisma.reply.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json(reply);
}
