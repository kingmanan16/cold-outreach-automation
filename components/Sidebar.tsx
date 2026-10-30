"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { KillSwitchButton } from "./KillSwitchButton";

const primary = [
  { href: "/dashboard", label: "Today" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/inbox", label: "Inbox" },
  { href: "/leads", label: "Leads" },
];

const more = [
  { href: "/accounts", label: "Accounts" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/suppressions", label: "Suppressions" },
  { href: "/settings", label: "Settings" },
];

function NavLink({
  href,
  label,
  active,
  badge,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`nav-item ${active ? "nav-item-active" : "nav-item-idle"}`}
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export default function Sidebar({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();
  const moreActive = more.some(
    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`)
  );
  const [moreOpen, setMoreOpen] = useState(moreActive);

  return (
    <aside className="relative flex w-[15.5rem] shrink-0 flex-col bg-[#0b1220] text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-teal-500/10 via-transparent to-sky-500/5" />
      <div className="relative border-b border-white/10 px-5 py-6">
        <p className="font-display text-lg font-semibold tracking-tight text-white">
          Cold Outreach
        </p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          Sequence control
        </p>
      </div>
      <nav className="relative flex flex-1 flex-col gap-1 px-3 py-4">
        {primary.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              active={active}
              badge={link.href === "/inbox" ? unreadCount : undefined}
            />
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="mt-4 flex items-center justify-between rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:bg-white/5 hover:text-slate-300"
        >
          More
          <span className="text-sm">{moreOpen ? "−" : "+"}</span>
        </button>
        {moreOpen &&
          more.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <NavLink
                key={link.href}
                href={link.href}
                label={link.label}
                active={active}
              />
            );
          })}
      </nav>
      <div className="relative space-y-2 border-t border-white/10 p-3">
        <KillSwitchButton />
        <form action="/api/logout" method="post">
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
