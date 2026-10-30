import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { TRANSPARENT_GIF } from "@/lib/tracking";

export async function GET(
  _request: Request,
  { params }: { params: { sentEmailId: string } }
) {
  try {
    await prisma.sentEmail.updateMany({
      where: { id: params.sentEmailId, opened: false },
      data: { opened: true },
    });
  } catch {
    // still return pixel even if id unknown
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
