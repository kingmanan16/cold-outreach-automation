import Link from "next/link";
import { prisma } from "@/lib/db";
import { TestConnectionButtons } from "@/components/TestConnectionButtons";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import {
  AccountDnsButton,
  AccountWarmupToggle,
  AccountPlacementButton,
} from "@/components/AccountExtras";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { oauth?: string; reason?: string };
}) {
  const accounts = await prisma.emailAccount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { sentEmails: true } },
    },
  });
  const oauthConfigured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Accounts</h1>
        <div className="flex gap-2">
          {oauthConfigured ? (
            <Link
              href="/api/oauth/google"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Connect Google OAuth
            </Link>
          ) : (
            <span
              title="Set GOOGLE_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI"
              className="cursor-not-allowed rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-400"
            >
              Connect Google OAuth
            </span>
          )}
          <Link
            href="/accounts/new"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Add account
          </Link>
        </div>
      </div>

      {searchParams.oauth === "connected" && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Google mailbox connected. Sends will use Gmail API (HTTPS) — works on
          Railway Hobby.
        </p>
      )}
      {oauthConfigured && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Railway blocks SMTP. For each sending mailbox click{" "}
          <strong>Connect Google OAuth</strong> (sign in as that mailbox) so the
          worker can send via Gmail API.
        </p>
      )}
      {searchParams.oauth === "missing" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID,
          GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.
        </p>
      )}
      {searchParams.oauth === "error" && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Google OAuth failed
          {searchParams.reason ? `: ${searchParams.reason}` : "."}
        </p>
      )}

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Daily</th>
              <th className="px-4 py-3 font-medium">DNS</th>
              <th className="px-4 py-3 font-medium">Warmup / score</th>
              <th className="px-4 py-3 font-medium">Tests</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No accounts yet.
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="border-t border-zinc-100 align-top">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {account.email}
                    {account.disabled && (
                      <span className="ml-2 text-xs text-red-600">disabled</span>
                    )}
                    {account.oauthProvider === "google" &&
                    (account.oauthAccessEnc || account.oauthRefreshEnc) ? (
                      <span className="ml-2 text-xs font-medium text-emerald-700">
                        Gmail API ready
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-amber-700">
                        SMTP only
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {account.sentToday}/{account.dailyLimit}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    SPF {account.spfOk == null ? "—" : account.spfOk ? "OK" : "X"} ·
                    DMARC{" "}
                    {account.dmarcOk == null ? "—" : account.dmarcOk ? "OK" : "X"}
                    <AccountDnsButton accountId={account.id} />
                  </td>
                  <td className="px-4 py-3">
                    <AccountWarmupToggle
                      accountId={account.id}
                      enabled={account.warmupEnabled}
                    />
                    <p className="text-[10px] text-zinc-500">
                      score {account.reputationScore.toFixed(1)}
                    </p>
                    <AccountPlacementButton accountId={account.id} />
                  </td>
                  <td className="px-4 py-3">
                    <TestConnectionButtons accountId={account.id} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <Link
                        href={`/accounts/${account.id}/edit`}
                        className="text-xs text-zinc-700 hover:underline"
                      >
                        Edit
                      </Link>
                      <DeleteAccountButton
                        accountId={account.id}
                        email={account.email}
                        sentEmailCount={account._count.sentEmails}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
