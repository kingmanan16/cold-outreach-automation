const CATEGORIES = ["interested", "not_interested", "ooo", "wrong_person"] as const;
export type ReplyAiCategory = (typeof CATEGORIES)[number];

export async function categorizeReply(
  snippet: string
): Promise<ReplyAiCategory | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[ai] GEMINI_API_KEY not set — skipping categorization");
    return null;
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `Categorize this cold-email reply into exactly one of: interested, not_interested, ooo, wrong_person.
Reply with only the category label, nothing else.

Reply snippet:
"""
${snippet.slice(0, 1500)}
"""`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 32,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join(" ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, "");

  if ((CATEGORIES as readonly string[]).includes(text)) {
    return text as ReplyAiCategory;
  }

  for (const cat of CATEGORIES) {
    if (text.includes(cat)) return cat;
  }

  console.warn(`[ai] unexpected category response: ${text}`);
  return null;
}
