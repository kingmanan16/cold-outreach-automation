import { NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** HubSpot sync stub: stores mapping when HUBSPOT_ACCESS_TOKEN is set */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "push-interested");

  if (!token) {
    return NextResponse.json(
      {
        error: "Set HUBSPOT_ACCESS_TOKEN env to enable HubSpot sync",
        configured: false,
      },
      { status: 400 }
    );
  }

  if (action === "push-interested") {
    const leads = await prisma.lead.findMany({
      where: { status: "INTERESTED", hubspotId: null },
      take: 50,
    });
    const synced: string[] = [];
    for (const lead of leads) {
      const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            email: lead.email,
            firstname: lead.firstName ?? "",
            lastname: lead.lastName ?? "",
            company: lead.company ?? "",
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await prisma.lead.update({
          where: { id: lead.id },
          data: { hubspotId: String(data.id) },
        });
        synced.push(lead.email);
      }
    }
    return NextResponse.json({ synced, count: synced.length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
