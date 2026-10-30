import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decodeTrackUrl } from "@/lib/tracking";

export async function GET(
  request: Request,
  { params }: { params: { sentEmailId: string } }
) {
  const { searchParams } = new URL(request.url);
  const encoded = searchParams.get("url") ?? "";
  const original = decodeTrackUrl(encoded);

  if (!original || !/^https?:\/\//i.test(original)) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    await prisma.sentEmail.updateMany({
      where: { id: params.sentEmailId },
      data: { clicked: true },
    });
  } catch {
    // continue redirect even if update fails
  }

  return NextResponse.redirect(original, 302);
}
