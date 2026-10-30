import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const CATEGORIES = new Set([
  "interested",
  "not_interested",
  "ooo",
  "wrong_person",
  "other",
]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const category = String(body.category ?? "");

  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const reply = await prisma.reply.update({
    where: { id: params.id },
    data: { category },
  });

  return NextResponse.json({ id: reply.id, category: reply.category });
}
