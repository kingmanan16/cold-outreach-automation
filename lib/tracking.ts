const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export function getAppBaseUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function encodeTrackUrl(url: string): string {
  return Buffer.from(url, "utf8").toString("base64url");
}

export function decodeTrackUrl(encoded: string): string | null {
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/** True when the campaign body looks like intentional HTML (not plain text). */
export function looksLikeHtml(body: string): boolean {
  return /<\s*(a|img|p|br|div|span|table|tr|td|th|ul|ol|li|strong|em|b|i|u|h[1-6]|hr|center|font)\b/i.test(
    body
  );
}

/** Strip tags for the multipart/plain fallback. Leaves link URLs readable. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*\/\s*div\s*>/gi, "\n")
    .replace(
      /<\s*a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\s*\/\s*a\s*>/gi,
      (_m, href: string, label: string) => {
        const text = label.replace(/<[^>]+>/g, "").trim();
        return text ? `${text} (${href})` : href;
      }
    )
    .replace(/<\s*img\b[^>]*alt\s*=\s*["']([^"']*)["'][^>]*\/?>/gi, "[$1]")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Light sanitize for operator-authored email HTML (no scripts / handlers). */
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*iframe\b[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, "")
    .replace(/<\s*(script|iframe)\b[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*(["'])[\s\S]*?\1/gi, "")
    .replace(/\shref\s*=\s*(["'])\s*javascript:[^"']*\1/gi, ' href="#"')
    .replace(/\ssrc\s*=\s*(["'])\s*javascript:[^"']*\1/gi, ' src=""');
}

/** Rewrite http(s) links in plain text to click-tracking URLs */
export function rewriteLinksForTracking(
  text: string,
  sentEmailId: string
): string {
  const base = getAppBaseUrl();
  return text.replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
    const clean = url.replace(/[),.;]+$/g, "");
    const trailing = url.slice(clean.length);
    const tracked = `${base}/api/track/click/${sentEmailId}?url=${encodeTrackUrl(clean)}`;
    return tracked + trailing;
  });
}

/**
 * Rewrite only href= links for click tracking.
 * Leaves <img src="..."> alone so embedded images still load.
 */
export function rewriteHtmlHrefsForTracking(
  html: string,
  sentEmailId: string
): string {
  const base = getAppBaseUrl();
  return html.replace(
    /\bhref\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi,
    (_match, quote: string, url: string) => {
      const tracked = `${base}/api/track/click/${sentEmailId}?url=${encodeTrackUrl(url)}`;
      return `href=${quote}${tracked}${quote}`;
    }
  );
}

function openPixelTag(sentEmailId: string): string {
  const pixel = `${getAppBaseUrl()}/api/track/open/${sentEmailId}`;
  return `<img src="${pixel}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
}

export function buildTrackedHtmlEmail(opts: {
  textBody: string;
  sentEmailId: string;
}): string {
  const pixel = openPixelTag(opts.sentEmailId);

  if (looksLikeHtml(opts.textBody)) {
    const cleaned = sanitizeEmailHtml(opts.textBody.trim());
    const withTrackedHrefs = rewriteHtmlHrefsForTracking(
      cleaned,
      opts.sentEmailId
    );
    const alreadyDocument = /<\s*html\b/i.test(withTrackedHrefs);
    if (alreadyDocument) {
      if (/<\s*\/\s*body\s*>/i.test(withTrackedHrefs)) {
        return withTrackedHrefs.replace(
          /<\s*\/\s*body\s*>/i,
          `${pixel}</body>`
        );
      }
      return `${withTrackedHrefs}\n${pixel}`;
    }
    return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#18181b;">
${withTrackedHrefs}
${pixel}
</body></html>`;
  }

  const withLinks = rewriteLinksForTracking(opts.textBody, opts.sentEmailId);
  const escaped = withLinks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Turn tracked URLs into clickable anchors in HTML
  const linked = escaped.replace(
    /(https?:\/\/[^\s&lt;]+)/gi,
    (url) => `<a href="${url}">${url}</a>`
  );

  return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#18181b;">
<div style="white-space:pre-wrap;">${linked}</div>
${pixel}
</body></html>`;
}

/** Build both MIME parts from a campaign body (plain or HTML). */
export function buildOutboundEmailBodies(
  body: string,
  sentEmailId: string
): { text: string; html: string } {
  if (looksLikeHtml(body)) {
    const plain = htmlToPlainText(body);
    return {
      text: rewriteLinksForTracking(plain, sentEmailId),
      html: buildTrackedHtmlEmail({ textBody: body, sentEmailId }),
    };
  }
  return {
    text: rewriteLinksForTracking(body, sentEmailId),
    html: buildTrackedHtmlEmail({ textBody: body, sentEmailId }),
  };
}

export function newSentEmailId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export { TRANSPARENT_GIF };
