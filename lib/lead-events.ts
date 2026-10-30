import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function recordLeadEvent(
  leadId: string,
  type: string,
  meta?: Record<string, unknown>
) {
  try {
    await prisma.leadEvent.create({
      data: {
        leadId,
        type,
        meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    console.error("[lead-event]", type, err);
  }
}
