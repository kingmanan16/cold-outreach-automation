import {
  getGoogleAccessToken,
  isGoogleOAuthAccount,
  type OAuthAccount,
} from "@/lib/gmail-oauth";

export type OutboundMail = {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  headers?: Record<string, string>;
};

export type SendResult = {
  messageId: string;
  via: "gmail-api" | "smtp";
};

function normalizeMessageId(id: string | undefined | null): string {
  if (!id) return "";
  const t = id.trim();
  if (!t) return "";
  return t.startsWith("<") ? t : `<${t}>`;
}

function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function foldBase64(value: string): string {
  return value.replace(/(.{76})/g, "$1\r\n").trim();
}

/** Build RFC822 MIME without nodemailer require() (Vercel ESLint-safe). */
export function buildRawMime(mail: OutboundMail): Buffer {
  const lines: string[] = [];
  lines.push(`From: ${mail.from}`);
  lines.push(`To: ${mail.to}`);
  lines.push(`Subject: ${encodeHeaderValue(mail.subject)}`);
  if (mail.inReplyTo) lines.push(`In-Reply-To: ${mail.inReplyTo}`);
  if (mail.references) lines.push(`References: ${mail.references}`);
  if (mail.headers) {
    for (const [key, value] of Object.entries(mail.headers)) {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("MIME-Version: 1.0");

  const text = mail.text ?? "";
  const html = mail.html;

  if (html && text) {
    const boundary = `cold_${Date.now().toString(36)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(foldBase64(Buffer.from(text, "utf8").toString("base64")));
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(foldBase64(Buffer.from(html, "utf8").toString("base64")));
    lines.push(`--${boundary}--`);
  } else if (html) {
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(foldBase64(Buffer.from(html, "utf8").toString("base64")));
  } else {
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(foldBase64(Buffer.from(text, "utf8").toString("base64")));
  }

  return Buffer.from(lines.join("\r\n"), "utf8");
}

function bufferToBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Send via Gmail HTTP API (works on Railway Hobby — no SMTP ports).
 */
export async function sendViaGmailApi(
  account: OAuthAccount & { email: string },
  mail: OutboundMail
): Promise<SendResult> {
  const accessToken = await getGoogleAccessToken(account);
  const rawBuf = buildRawMime({
    ...mail,
    from: mail.from || account.email,
  });
  const raw = bufferToBase64Url(rawBuf);

  async function postSend(token: string) {
    return fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
        signal: AbortSignal.timeout(60_000),
      }
    );
  }

  let res = await postSend(accessToken);

  if (!res.ok && res.status === 401 && account.oauthRefreshEnc) {
    const { refreshGoogleAccessToken } = await import("@/lib/gmail-oauth");
    const token = await refreshGoogleAccessToken(account);
    res = await postSend(token);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Gmail API send failed (${res.status}): ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as { id?: string };
  let messageId = "";
  if (data.id) {
    try {
      const meta = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${data.id}?format=metadata&metadataHeaders=Message-ID`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(20_000),
        }
      );
      if (meta.ok) {
        const body = (await meta.json()) as {
          payload?: { headers?: Array<{ name: string; value: string }> };
        };
        const hdr = body.payload?.headers?.find(
          (h) => h.name.toLowerCase() === "message-id"
        );
        messageId = normalizeMessageId(hdr?.value);
      }
    } catch {
      // ignore metadata fetch errors
    }
    if (!messageId) {
      messageId = `<${data.id}@gmail.googleapis.com>`;
    }
  }

  if (!messageId) throw new Error("Gmail API returned no message id");
  return { messageId, via: "gmail-api" };
}

export { isGoogleOAuthAccount };
