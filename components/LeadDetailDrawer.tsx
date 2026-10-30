"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LeadStatus } from "@prisma/client";
import { LeadStatusSelect } from "@/components/LeadStatusSelect";
import { LeadReminder } from "@/components/LeadReminder";
import { StatusBadge } from "@/lib/lead-status";
import { formatRelativeTime } from "@/lib/date-range";

type DrawerLead = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: LeadStatus;
  customFields: unknown;
  reminderAt: string | null;
  createdAt: string;
  list: { id: string; name: string };
  notes: Array<{ id: string; content: string; createdAt: string }>;
  events: Array<{ id: string; type: string; meta: unknown; createdAt: string }>;
  sentEmails: Array<{
    id: string;
    subject: string;
    sentAt: string;
    opened: boolean;
    clicked: boolean;
    bounced: boolean;
    isManualReply: boolean;
  }>;
  replies: Array<{
    id: string;
    receivedAt: string;
    snippet: string | null;
    category: string | null;
  }>;
  campaignLeads: Array<{
    id: string;
    currentStep: number;
    status: string;
    nextSendAt: string | null;
    campaign: { id: string; name: string; status: string };
  }>;
};

export function LeadDetailDrawer({
  leadId,
  onClose,
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const open = Boolean(leadId);
  const [lead, setLead] = useState<DrawerLead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setLead(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/leads/${leadId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load lead");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setLead(data.lead as DrawerLead);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setLead(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const customFields = useMemo(() => {
    if (
      !lead?.customFields ||
      typeof lead.customFields !== "object" ||
      Array.isArray(lead.customFields)
    ) {
      return null;
    }
    return lead.customFields as Record<string, unknown>;
  }, [lead]);

  const timeline = useMemo(() => {
    if (!lead) return [];
    type Item = { at: Date; label: string; detail?: string };
    const items: Item[] = [];
    for (const e of lead.events) {
      items.push({
        at: new Date(e.createdAt),
        label: e.type,
        detail: e.meta ? JSON.stringify(e.meta) : undefined,
      });
    }
    for (const s of lead.sentEmails) {
      items.push({
        at: new Date(s.sentAt),
        label: s.bounced
          ? "bounced"
          : s.isManualReply
            ? "manual_reply"
            : "sent",
        detail: `${s.subject}${s.opened ? " · opened" : ""}${s.clicked ? " · clicked" : ""}`,
      });
    }
    for (const r of lead.replies) {
      items.push({
        at: new Date(r.receivedAt),
        label: r.category ? `reply · ${r.category}` : "reply",
        detail: r.snippet ?? undefined,
      });
    }
    for (const n of lead.notes) {
      items.push({
        at: new Date(n.createdAt),
        label: "note",
        detail: n.content,
      });
    }
    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return items.slice(0, 40);
  }, [lead]);

  const name = lead
    ? [lead.firstName, lead.lastName].filter(Boolean).join(" ")
    : "";

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200/80 bg-white shadow-lift transition-transform duration-300 ease-out sm:max-w-lg ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Lead details"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700/80">
              Lead
            </p>
            <h2 className="mt-1 truncate font-display text-xl font-semibold text-ink">
              {loading ? "Loading…" : name || lead?.email || "Details"}
            </h2>
            {lead && (
              <p className="mt-0.5 truncate text-sm text-ink-mute">{lead.email}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {lead && <StatusBadge status={lead.status} />}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-ink-soft hover:bg-slate-50"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {loading && !lead && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl bg-slate-100"
                />
              ))}
            </div>
          )}
          {lead && (
            <div className="space-y-6" key={lead.id}>
              <section>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                  Details
                </h3>
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Email" value={lead.email} />
                  <Field label="First name" value={lead.firstName} />
                  <Field label="Last name" value={lead.lastName} />
                  <Field label="Company" value={lead.company} />
                  <Field label="List" value={lead.list.name} />
                  <Field
                    label="Added"
                    value={new Date(lead.createdAt).toLocaleDateString()}
                  />
                  <div className="sm:col-span-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
                      Status
                    </dt>
                    <dd className="mt-1.5">
                      <LeadStatusSelect
                        leadId={lead.id}
                        currentStatus={lead.status}
                      />
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <LeadReminder
                      leadId={lead.id}
                      reminderAt={lead.reminderAt}
                    />
                  </div>
                </dl>
              </section>

              {customFields && Object.keys(customFields).length > 0 && (
                <section className="border-t border-slate-100 pt-5">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                    Custom fields
                  </h3>
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {Object.entries(customFields).map(([key, value]) => (
                      <Field
                        key={key}
                        label={key}
                        value={value == null ? "" : String(value)}
                      />
                    ))}
                  </dl>
                </section>
              )}

              {lead.campaignLeads.length > 0 && (
                <section className="border-t border-slate-100 pt-5">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                    Campaigns
                  </h3>
                  <ul className="space-y-2">
                    {lead.campaignLeads.map((cl) => (
                      <li
                        key={cl.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm"
                      >
                        <Link
                          href={`/campaigns/${cl.campaign.id}`}
                          className="font-medium text-ink hover:underline"
                        >
                          {cl.campaign.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-mute">
                          Step {cl.currentStep} · {cl.status}
                          {cl.nextSendAt
                            ? ` · next ${formatRelativeTime(new Date(cl.nextSendAt))}`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="border-t border-slate-100 pt-5">
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                  Activity
                </h3>
                {timeline.length === 0 ? (
                  <p className="text-sm text-ink-mute">No activity yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {timeline.map((item, i) => (
                      <li
                        key={`${item.at.toISOString()}-${i}`}
                        className="relative border-l-2 border-teal-200/80 pl-3"
                      >
                        <p className="text-sm font-medium text-ink">
                          {item.label}
                        </p>
                        {item.detail && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                            {item.detail}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-ink-mute">
                          {formatRelativeTime(item.at)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>

        {lead && (
          <footer className="border-t border-slate-100 px-5 py-3">
            <Link
              href={`/leads/${lead.id}`}
              className="btn-primary inline-flex w-full justify-center py-2.5 text-sm"
            >
              Open full page
            </Link>
          </footer>
        )}
      </aside>
    </>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const text = value?.trim() ?? "";
  const isUrl = /^https?:\/\//i.test(text);
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-ink">
        {!text ? (
          "—"
        ) : isUrl ? (
          <a
            href={text}
            target="_blank"
            rel="noreferrer"
            className="text-teal-800 underline decoration-teal-300/60 underline-offset-2 hover:text-teal-950"
          >
            {text}
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}
