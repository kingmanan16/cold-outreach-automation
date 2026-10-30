export type TemplateLead = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  customFields?: unknown;
};

/** Normalize for fuzzy match: "Team Name" / "team_name" / "teamName" → "teamname" */
export function normalizeVarKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function customFieldsRecord(
  customFields: unknown
): Record<string, string> {
  if (!customFields || typeof customFields !== "object" || Array.isArray(customFields)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(customFields as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = String(v);
  }
  return out;
}

/** Flat map of every replaceable key (exact + normalized) → value */
export function buildTemplateVars(lead: TemplateLead): Record<string, string> {
  const vars: Record<string, string> = {};

  function set(key: string, value: string) {
    if (!key) return;
    vars[key] = value;
    const n = normalizeVarKey(key);
    if (n && vars[n] === undefined) vars[n] = value;
  }

  set("email", lead.email ?? "");
  set("firstName", lead.firstName ?? "");
  set("lastName", lead.lastName ?? "");
  set("company", lead.company ?? "");
  // Common aliases
  set("first_name", lead.firstName ?? "");
  set("last_name", lead.lastName ?? "");
  set("name", [lead.firstName, lead.lastName].filter(Boolean).join(" "));

  for (const [k, v] of Object.entries(customFieldsRecord(lead.customFields))) {
    set(k, v);
  }

  return vars;
}

export function listTemplateVariableNames(lead: TemplateLead): string[] {
  const names = new Set<string>(["firstName", "lastName", "company", "email"]);
  for (const k of Object.keys(customFieldsRecord(lead.customFields))) {
    names.add(k);
  }
  return Array.from(names);
}

/**
 * Replace {{var}} tokens. Matches exact key first, then normalized
 * (so {{Team Name}} and {{teamName}} both work for custom field "Team Name").
 */
export function renderTemplate(template: string, lead: TemplateLead): string {
  const vars = buildTemplateVars(lead);
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (full, rawKey: string) => {
    const key = String(rawKey).trim();
    if (!key) return full;
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key] ?? "";
    const n = normalizeVarKey(key);
    if (n && Object.prototype.hasOwnProperty.call(vars, n)) return vars[n] ?? "";
    return full;
  });
}
