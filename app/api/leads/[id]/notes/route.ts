import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const content = String(body.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const note = await prisma.note.create({
    data: { leadId: params.id, content },
  });

  return NextResponse.json(note, { status: 201 });
}
