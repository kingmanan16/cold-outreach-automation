import dns from "dns";
import nodemailer from "nodemailer";
import { buildSmtpAuth } from "@/lib/smtp-auth";

type SmtpAccount = {
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassEnc: string;
  oauthProvider?: string | null;
  oauthAccessEnc?: string | null;
};

/**
 * Force IPv4 DNS/socket family.
 * Railway (and similar) often resolve Gmail AAAA but cannot route IPv6 →
 * `connect ENETUNREACH 2607:...:465 - Local (:::0)`.
 */
function ipv4Lookup(
  hostname: string,
  options: dns.LookupOneOptions | number | ((...args: never[]) => void),
  callback?: (
    err: NodeJS.ErrnoException | null,
    address: string,
    family: number
  ) => void
) {
  if (typeof options === "function") {
    callback = options as typeof callback;
    options = {};
  }
  const opts: dns.LookupOneOptions =
    typeof options === "number"
      ? { family: 4 }
      : { ...(options || {}), family: 4 };
  dns.lookup(hostname, opts, callback!);
}

export function createSmtpTransport(account: SmtpAccount) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    auth: buildSmtpAuth(account),
    family: 4,
    lookup: ipv4Lookup,
  } as Parameters<typeof nodemailer.createTransport>[0]);
}
