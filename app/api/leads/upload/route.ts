import { NextResponse } from "next/server";
import { LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type UploadRow = {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  customFields?: Record<string, string>;
};

export async function POST(request: Request) {
  const body = await request.json();
  const listName = String(body.listName ?? "").trim();
  const rows = body.rows as UploadRow[] | undefined;

  if (!listName) {
    return NextResponse.json({ error: "List name is required" }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows to upload" }, { status: 400 });
  }

  const list = await prisma.leadList.create({
    data: { name: listName },
  });

  let created = 0;
  let duplicatesSkipped = 0;

  for (const row of rows) {
    const email = String(row.email ?? "").trim().toLowerCase();
    if (!email) {
      duplicatesSkipped += 1;
      continue;
    }

    const existing = await prisma.lead.findUnique({ where: { email } });
    if (existing) {
      duplicatesSkipped += 1;
      continue;
    }

    const customFields =
      row.customFields && Object.keys(row.customFields).length > 0
        ? (row.customFields as Prisma.InputJsonValue)
        : undefined;

    await prisma.lead.create({
      data: {
        email,
        firstName: row.firstName?.trim() || null,
        lastName: row.lastName?.trim() || null,
        company: row.company?.trim() || null,
        customFields,
        status: LeadStatus.NEW,
        listId: list.id,
      },
    });
    created += 1;
  }

  return NextResponse.json({
    listId: list.id,
    created,
    duplicatesSkipped,
  });
}
