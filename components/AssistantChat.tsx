"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  degraded?: boolean;
};

const STARTER = `Hi — I'm your Cold Outreach operator assistant. I can see live campaign stats and explain why sends are stuck, how follow-ups work, mailboxes, caps, and Railway worker issues. What do you need?`;

function campaignIdFromPath(path: string): string | undefined {
  const m = path.match(/^\/campaigns\/([^/]+)/);
  return m?.[1];
}

export function AssistantChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: STARTER },
  ]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [open, messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);

    try {
      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome" || messages.length > 1)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-10),
          campaignId: campaignIdFromPath(pathname ?? ""),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply ?? data.error ?? "No response.",
          degraded: Boolean(data.degraded),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content:
            "Could not reach the assistant. Check you're logged in and try again.",
          degraded: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, input, messages, pathname]);

  return (
    <>
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex h-[min(520px,70vh)] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
          role="dialog"
          aria-label="Cold Outreach assistant"
        >
          <header className="flex items-center justify-between border-b border-zinc-100 bg-zinc-900 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Outreach assistant</p>
              <p className="text-[11px] text-zinc-300">
                Gemini · live campaign data
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-lg leading-none text-zinc-300 hover:bg-zinc-800 hover:text-white"
              aria-label="Close assistant"
            >
              ×
            </button>
          </header>

          <div
            ref={scrollerRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-zinc-900 text-white"
                      : m.degraded
                        ? "border border-amber-200 bg-amber-50 text-amber-950"
                        : "border border-zinc-100 bg-zinc-50 text-zinc-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <p className="text-xs text-zinc-400">Thinking…</p>
            )}
          </div>

          <footer className="border-t border-zinc-100 p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Why aren't follow-ups sending?"
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Send
              </button>
            </form>
          </footer>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg hover:bg-zinc-800"
        aria-label={open ? "Close assistant" : "Open assistant"}
        title="Outreach assistant"
      >
        {open ? "×" : "?"}
      </button>
    </>
  );
}
