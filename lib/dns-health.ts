import { resolve4, resolveTxt } from "dns/promises";

export type DnsHealth = {
  domain: string;
  spfOk: boolean;
  dkimOk: boolean | null;
  dmarcOk: boolean;
  details: string[];
};

export async function checkDomainDns(email: string): Promise<DnsHealth> {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const details: string[] = [];
  let spfOk = false;
  let dmarcOk = false;
  let dkimOk: boolean | null = null;

  if (!domain) {
    return { domain: "", spfOk: false, dkimOk: false, dmarcOk: false, details: ["Invalid email"] };
  }

  try {
    const txt = await resolveTxt(domain);
    const flat = txt.map((r) => r.join(""));
    const spf = flat.find((t) => t.toLowerCase().startsWith("v=spf1"));
    spfOk = Boolean(spf);
    details.push(spf ? `SPF: ${spf.slice(0, 120)}` : "SPF: missing");
  } catch {
    details.push("SPF: lookup failed");
  }

  try {
    const dmarc = await resolveTxt(`_dmarc.${domain}`);
    const flat = dmarc.map((r) => r.join(""));
    const rec = flat.find((t) => t.toLowerCase().startsWith("v=dmarc1"));
    dmarcOk = Boolean(rec);
    details.push(rec ? `DMARC: ${rec.slice(0, 120)}` : "DMARC: missing");
  } catch {
    details.push("DMARC: lookup failed");
  }

  try {
    await resolve4(domain);
    dkimOk = null;
    details.push("DKIM: cannot verify selector automatically (null)");
  } catch {
    details.push("A record lookup failed");
  }

  return { domain, spfOk, dkimOk, dmarcOk, details };
}
