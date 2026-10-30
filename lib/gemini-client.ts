export type GeminiMessage = { role: "user" | "model"; text: string };

type GenerateOpts = {
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

/**
 * Shared Gemini HTTP client (same endpoint as reply categorization).
 * Returns null when GEMINI_API_KEY is missing — callers should degrade gracefully.
 */
export async function geminiGenerate(
  prompt: string,
  opts?: GenerateOpts
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(opts?.systemInstruction
        ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } }
        : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts?.temperature ?? 0.2,
        maxOutputTokens: opts?.maxOutputTokens ?? 1024,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  return text || null;
}

export async function geminiChat(
  messages: GeminiMessage[],
  opts?: GenerateOpts
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(opts?.systemInstruction
        ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } }
        : {}),
      contents,
      generationConfig: {
        temperature: opts?.temperature ?? 0.25,
        maxOutputTokens: opts?.maxOutputTokens ?? 1200,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  return (
    (data.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim() || null
  );
}
