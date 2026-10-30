import { createSmtpTransport } from "@/lib/smtp-transport";
import {
  isGoogleOAuthAccount,
  sendViaGmailApi,
  type OutboundMail,
  type SendResult,
} from "@/lib/gmail-send";

type SendAccount = {
  id: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassEnc: string;
  oauthProvider?: string | null;
  oauthAccessEnc?: string | null;
  oauthRefreshEnc?: string | null;
  oauthExpiry?: Date | null;
};

function isSmtpLikelyBlockedHost(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID
  );
}

/**
 * Prefer Gmail HTTP API when OAuth is connected (Railway-safe).
 * Fall back to SMTP for local / non-Google accounts.
 */
export async function sendOutboundMail(
  account: SendAccount,
  mail: OutboundMail,
  opts?: { preferSmtp?: boolean }
): Promise<SendResult> {
  const blocked = (process.env.DISABLE_OUTBOUND_MAIL ?? "").trim().toLowerCase();
  if (blocked === "1" || blocked === "true" || blocked === "yes") {
    throw new Error("DISABLE_OUTBOUND_MAIL is set — outbound send blocked");
  }

  const useGmailApi = !opts?.preferSmtp && isGoogleOAuthAccount(account);

  if (useGmailApi) {
    return sendViaGmailApi(account, {
      ...mail,
      from: mail.from || account.email,
    });
  }

  if (isSmtpLikelyBlockedHost() && !opts?.preferSmtp) {
    throw new Error(
      `SMTP blocked on Railway for ${account.email}. Connect Google OAuth (Accounts → Connect Google OAuth) so sends use Gmail API over HTTPS.`
    );
  }

  const transporter = createSmtpTransport(account);
  const info = await transporter.sendMail({
    from: mail.from || account.email,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    headers: mail.headers,
  });

  const messageId = info.messageId?.trim();
  if (!messageId) {
    throw new Error("SMTP send returned no messageId");
  }
  return {
    messageId: messageId.startsWith("<") ? messageId : `<${messageId}>`,
    via: "smtp",
  };
}
