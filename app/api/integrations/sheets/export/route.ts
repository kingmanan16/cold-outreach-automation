import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Google Sheets-friendly CSV export of leads */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const leads = await prisma.lead.findMany({
    where: status ? { status: status as never } : undefined,
    include: { list: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const header = "email,firstName,lastName,company,status,list,hubspotId";
  const rows = leads.map((l) =>
    [
      l.email,
      l.firstName ?? "",
      l.lastName ?? "",
      l.company ?? "",
      l.status,
      l.list.name,
      l.hubspotId ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads-export.csv"',
    },
  });
}
