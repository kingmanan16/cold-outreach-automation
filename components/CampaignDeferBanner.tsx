"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CampaignSendNowButton } from "./CampaignSendNowButton";
import { CampaignReEnrollButton } from "./CampaignReEnrollButton";

type Diagnostics = {
  idleReason: string | null;
  dueCount: number;
  activeLeads: number;
  totalLeads: number;
  totalSteps: number;
  capacity: number;
  mailboxCount: number;
  reEnrollable: number;
  dailyCap: number;
  sentToday: number;
  remainingToday: number;
  maxPerTick: number;
};

/** Each reason names the one thing to change — never two causes under one label. */
const REASON: Record<string, { title: string; fix: string }> = {
  GLOBAL_PAUSED: {
    title: "Global kill switch is on",
    fix: "Every campaign is paused. Turn it off in Settings.",
  },
  PAUSED: {
    title: "Campaign is not Active",
    fix: "Set the status to Active to start sending.",
  },
  NO_SEQUENCE: {
    title: "No mails in this sequence",
    fix: "Add at least Mail 1 before this campaign can send.",
  },
  NO_LEADS: {
    title: "No leads attached",
    fix: "Attach a lead list to this campaign.",
  },
  BEFORE_START: {
    title: "Scheduled start is still in the future",
    fix: "Change the start date, or use Send now to override it once.",
  },
  OUTSIDE_WINDOW: {
    title: "Outside the send window",
    fix: "Sending resumes at the start of the next window.",
  },
  WRONG_DAY: {
    title: "Today is not a send day",
    fix: "Add this weekday under Schedule, or use Send now.",
  },
  MAILBOX_LIMIT_REACHED: {
    title: "Mailboxes are out of room today",
    fix: "Every mailbox on this campaign hit its own daily limit. Raise a mailbox limit or connect another mailbox.",
  },
  CAMPAIGN_CAP_REACHED: {
    title: "Campaign daily cap reached",
    fix: "This campaign's own cap is spent for today. Raise Max emails / day to send more.",
  },
  LEADS_BEHIND_SEQUENCE: {
    title: "Leads are behind the current sequence",
    fix: "They finished a shorter version of this sequence, so the newer mails will never reach them until you resume them.",
  },
  ALL_LEADS_FINISHED: {
    title: "Every lead has finished the sequence",
    fix: "Attach more leads, or add another follow-up and resume the finished ones.",
  },
  NO_DUE_LEADS: {
    title: "No leads due right now",
    fix: "Leads are waiting out their follow-up delay. Nothing to do.",
  },
};

export function CampaignDeferBanner({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Diagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/diagnostics`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        /* ignore */
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [campaignId]);

  if (!data) {
    return (
      <div className="h-[72px] animate-pulse rounded-md border border-zinc-200 bg-zinc-50" />
    );
  }

  const stats = (
    <p className="mt-1 text-xs opacity-80">
      {data.dueCount} due · {data.remainingToday} of {data.dailyCap} left in
      today&apos;s campaign cap · {data.capacity} mailbox capacity
    </p>
  );

  if (!data.idleReason) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <p className="font-medium">Sending is live</p>
        {stats}
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <CampaignSendNowButton
            campaignId={campaignId}
            maxPerTick={data.maxPerTick}
          />
          {data.reEnrollable > 0 && (
            <CampaignReEnrollButton
              campaignId={campaignId}
              count={data.reEnrollable}
            />
          )}
        </div>
      </div>
    );
  }

  const info = REASON[data.idleReason] ?? {
    title: data.idleReason,
    fix: "",
  };
  const behind = data.idleReason === "LEADS_BEHIND_SEQUENCE";

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">Not sending: {info.title}</p>
      {info.fix && <p className="mt-1 text-xs text-amber-900/90">{info.fix}</p>}
      {stats}
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {(behind || data.reEnrollable > 0) && (
          <CampaignReEnrollButton
            campaignId={campaignId}
            count={data.reEnrollable}
          />
        )}
        {data.idleReason === "NO_SEQUENCE" || data.idleReason === "NO_LEADS" ? (
          <Link
            href={`/campaigns/${campaignId}/edit`}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Open editor
          </Link>
        ) : (
          <CampaignSendNowButton
            campaignId={campaignId}
            maxPerTick={data.maxPerTick}
            label="Send now (bypass window once)"
          />
        )}
      </div>
    </div>
  );
}
