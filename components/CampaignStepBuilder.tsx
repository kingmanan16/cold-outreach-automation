"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listTemplateVariableNames, renderTemplate } from "@/lib/template";
import { checkEmailContent } from "@/lib/spam-check";
import { mailTabLabel, standardFourMailSteps } from "@/lib/sequence-labels";
import { looksLikeHtml } from "@/lib/tracking";
import { replySubject } from "@/lib/thread-continuity";
import { flashClass, useFlash } from "@/lib/use-flash";
import { CampaignReEnrollButton } from "./CampaignReEnrollButton";

export type EditableStep = {
  subject: string;
  subjectB?: string;
  body: string;
  bodyB?: string;
  delayDays: number;
  winner?: string;
};

type SampleLead = {
  email?: string;
  firstName: string;
  lastName: string;
  company: string;
  customFields?: Record<string, string>;
};

const BASE_VARIABLES = ["firstName", "lastName", "company", "email"] as const;

function emptyStep(delayDays: number): EditableStep {
  return { subject: "", subjectB: "", body: "", bodyB: "", delayDays };
}

function stepsEqual(a: EditableStep[], b: EditableStep[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function CampaignStepBuilder({
  campaignId,
  initialSteps,
  sampleLead,
  hasAttachedLeads,
  attachedLeadCount = 0,
  threadFollowUps = true,
}: {
  campaignId: string;
  initialSteps: EditableStep[];
  sampleLead: SampleLead;
  hasAttachedLeads: boolean;
  attachedLeadCount?: number;
  threadFollowUps?: boolean;
}) {
  const router = useRouter();
  const { flash, show } = useFlash();

  const startingSteps = useMemo(
    () => (initialSteps.length > 0 ? initialSteps : [emptyStep(0)]),
    [initialSteps]
  );

  const [steps, setSteps] = useState<EditableStep[]>(startingSteps);
  const [savedSteps, setSavedSteps] = useState<EditableStep[]>(startingSteps);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [previewVariant, setPreviewVariant] = useState<"A" | "B">("A");
  const [reEnrollable, setReEnrollable] = useState(0);

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);
  const lastFocused = useRef<"subject" | "body">("body");

  const active = steps[activeIndex] ?? steps[0];
  const dirty = !stepsEqual(steps, savedSteps);

  // A whole rewritten sequence used to vanish on a stray back button.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Spam checks used to run only on save, so problems surfaced far too late.
  const liveSpam = useMemo(() => {
    if (!active) return { ok: true, blockers: [], warnings: [] };
    return checkEmailContent(active.subject, active.body);
  }, [active]);

  const isFollowUp = activeIndex > 0;
  const rootSubject = steps[0]?.subject ?? "";
  const threadedSubject = threadFollowUps && isFollowUp;

  const previewSubject = useMemo(() => {
    if (!active) return "";
    if (threadedSubject) {
      return replySubject(renderTemplate(rootSubject, sampleLead));
    }
    const raw =
      previewVariant === "B" && active.subjectB?.trim()
        ? active.subjectB
        : active.subject;
    return renderTemplate(raw, sampleLead);
  }, [active, previewVariant, sampleLead, threadedSubject, rootSubject]);

  const previewBody = useMemo(() => {
    if (!active) return "";
    const raw =
      previewVariant === "B" && active.bodyB?.trim() ? active.bodyB : active.body;
    return renderTemplate(raw, sampleLead);
  }, [active, previewVariant, sampleLead]);

  const variableNames = useMemo(() => {
    const fromLead = listTemplateVariableNames(sampleLead);
    const merged = new Set<string>([...BASE_VARIABLES, ...fromLead]);
    return Array.from(merged);
  }, [sampleLead]);

  const updateActive = useCallback(
    (patch: Partial<EditableStep>) => {
      setSteps((prev) =>
        prev.map((step, i) => (i === activeIndex ? { ...step, ...patch } : step))
      );
    },
    [activeIndex]
  );

  /** Insert at the caret so the token lands where the writer is looking. */
  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    const into = threadedSubject ? "body" : lastFocused.current;
    const target = into === "subject" ? subjectRef : bodyRef;
    const el = target.current;
    if (!el) {
      updateActive(
        into === "subject"
          ? { subject: `${active?.subject ?? ""}${token}` }
          : { body: `${active?.body ?? ""}${token}` }
      );
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    updateActive(into === "subject" ? { subject: next } : { body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function midSequenceWarning(action: string): boolean {
    if (!hasAttachedLeads) return true;
    return window.confirm(
      `${action}\n\nMails are matched to leads by position, not by name. Leads part-way through this sequence will receive whichever mail now sits at their position — which may not be the one they were waiting for.\n\nAdding a new mail at the end is always safe. Continue?`
    );
  }

  function applyFourMailPreset() {
    if (
      steps.some((s) => s.subject.trim() || s.body.trim()) &&
      !window.confirm(
        "Replace current steps with the standard 4-mail sequence (Mail 1 + 3 follow-ups)?"
      )
    ) {
      return;
    }
    setSteps(standardFourMailSteps());
    setActiveIndex(0);
    show("success", "Loaded 4-mail sequence — edit the copy, then Save sequence");
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep(prev.length === 0 ? 0 : 3)]);
    setActiveIndex(steps.length);
  }

  function duplicateStep(index: number) {
    setSteps((prev) => {
      const copy = { ...prev[index] };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      next[0] = { ...next[0], delayDays: 0 };
      return next;
    });
    setActiveIndex(index + 1);
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return;
    if (!midSequenceWarning(`Remove ${mailTabLabel(index)}?`)) return;
    const next = steps.filter((_, i) => i !== index);
    if (next.length > 0) next[0] = { ...next[0], delayDays: 0 };
    setSteps(next);
    setActiveIndex(Math.max(0, index - 1));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    if (
      !midSequenceWarning(
        `Move ${mailTabLabel(index)} ${direction === -1 ? "up" : "down"}?`
      )
    ) {
      return;
    }
    const next = [...steps];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    next[0] = { ...next[0], delayDays: 0 };
    setSteps(next);
    setActiveIndex(target);
  }

  async function saveSteps(): Promise<boolean> {
    setSaving(true);
    try {
      for (let i = 0; i < steps.length; i++) {
        const spam = checkEmailContent(steps[i].subject, steps[i].body);
        if (!spam.ok) {
          show("error", `${mailTabLabel(i)}: ${spam.blockers.join("; ")}`);
          setActiveIndex(i);
          return false;
        }
      }
      const payload = steps.map((s, i) => ({
        ...s,
        // The sender floors follow-ups at one day; store what will happen.
        delayDays: i === 0 ? 0 : Math.max(1, Math.floor(Number(s.delayDays) || 0)),
      }));
      const res = await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        show("error", data.error ?? "Failed to save steps");
        return false;
      }
      setSteps(payload);
      setSavedSteps(payload);
      setReEnrollable(Number(data.reEnrollable ?? 0));
      show(
        "success",
        data.reEnrollable > 0
          ? `Sequence saved. ${data.reEnrollable} lead(s) already finished the old sequence and need resuming.`
          : "Sequence saved"
      );
      router.refresh();
      return true;
    } catch {
      show("error", "Failed to save steps");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo.includes("@")) {
      show("error", "Enter a test email address first");
      return;
    }
    // Saving first is required — the API renders from stored steps.
    const saved = await saveSteps();
    if (!saved) return;
    const res = await fetch(`/api/campaigns/${campaignId}/test-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testTo, stepOrder: activeIndex }),
    });
    const data = await res.json();
    if (!res.ok) {
      show("error", data.error ?? "Test send failed");
      return;
    }
    show("success", `Test sent to ${testTo} via ${data.via}`);
  }

  return (
    <div className="space-y-4">
      {hasAttachedLeads && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">
            {attachedLeadCount || "Some"} lead
            {attachedLeadCount === 1 ? " is" : "s are"} already in this campaign.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-900/85">
            <li>Editing a mail&apos;s text only affects sends that have not happened yet.</li>
            <li>
              Adding a mail at the end is safe — but leads that already finished
              the sequence will not receive it until you resume them.
            </li>
            <li>
              Reordering or removing a mail changes which mail a mid-sequence
              lead gets next, because mails are matched by position.
            </li>
          </ul>
        </div>
      )}

      {reEnrollable > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-sm text-orange-950">
            <span className="font-medium">
              {reEnrollable} lead{reEnrollable === 1 ? "" : "s"} finished the old
              sequence.
            </span>{" "}
            They will never receive the mails you just added on their own.
          </p>
          <CampaignReEnrollButton campaignId={campaignId} count={reEnrollable} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={applyFourMailPreset}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Use standard 4-mail sequence
        </button>
        <span className="text-xs text-zinc-500">
          Mail 1 + 3 follow-ups (delays 0 / 3 / 3 / 3 days) — fully editable
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, index) => {
          const incomplete = !step.subject.trim() || !step.body.trim();
          return (
            <button
              key={index}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                index === activeIndex
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {mailTabLabel(index)}
              {incomplete && (
                <span
                  title="Subject or body is empty"
                  className="ml-1.5 text-amber-500"
                >
                  •
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={addStep}
          className="rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
        >
          + Add mail
        </button>
        {dirty && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
            Unsaved changes
          </span>
        )}
      </div>

      {active && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => moveStep(activeIndex, -1)}
                disabled={activeIndex === 0}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => moveStep(activeIndex, 1)}
                disabled={activeIndex === steps.length - 1}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs disabled:opacity-40"
              >
                Move down
              </button>
              <button
                type="button"
                onClick={() => duplicateStep(activeIndex)}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => removeStep(activeIndex)}
                disabled={steps.length <= 1}
                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-40"
              >
                Remove
              </button>
            </div>

            <div>
              <label
                htmlFor="delay-days"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Wait days after previous mail
              </label>
              <input
                id="delay-days"
                type="number"
                min={1}
                value={activeIndex === 0 ? 0 : active.delayDays}
                disabled={activeIndex === 0}
                onChange={(e) =>
                  updateActive({ delayDays: Number(e.target.value) })
                }
                className="w-32 rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50"
              />
              <p className="mt-1 text-xs text-zinc-500">
                {activeIndex === 0
                  ? "First mail always sends on day 0."
                  : "Minimum 1 day — a follow-up never goes out the same day as the mail before it."}
              </p>
            </div>

            <div>
              <label
                htmlFor="step-subject"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Subject
              </label>
              {threadedSubject ? (
                <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2">
                  <p className="text-sm text-zinc-700">
                    {previewSubject || "Re: (Mail 1 subject)"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Follow-ups reply inside Mail 1&apos;s thread, so they reuse
                    its subject. Turn off &ldquo;Reply in the same thread&rdquo;
                    on the campaign page to give this mail its own subject.
                  </p>
                </div>
              ) : (
                <input
                  id="step-subject"
                  ref={subjectRef}
                  onFocus={() => (lastFocused.current = "subject")}
                  value={active.subject}
                  onChange={(e) => updateActive({ subject: e.target.value })}
                  placeholder="Hi {{firstName}}, quick question"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              )}
            </div>

            <div>
              <label
                htmlFor="step-body"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Body
              </label>
              <textarea
                id="step-body"
                ref={bodyRef}
                onFocus={() => (lastFocused.current = "body")}
                value={active.body}
                onChange={(e) => updateActive({ body: e.target.value })}
                rows={10}
                placeholder={"Hi {{firstName}},\n\nI noticed {{company}}..."}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                HTML allowed:{" "}
                <code className="rounded bg-zinc-100 px-1">&lt;a&gt;</code>{" "}
                (RSVP / Maps),{" "}
                <code className="rounded bg-zinc-100 px-1">&lt;img&gt;</code>{" "}
                (https image URL),{" "}
                <code className="rounded bg-zinc-100 px-1">&lt;br&gt;</code>,{" "}
                <code className="rounded bg-zinc-100 px-1">&lt;b&gt;</code>. Use a
                styled link for buttons — email clients ignore{" "}
                <code className="rounded bg-zinc-100 px-1">&lt;button&gt;</code>.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-zinc-500">Insert:</span>
                {variableNames.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-700 hover:bg-zinc-100"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            {(liveSpam.blockers.length > 0 || liveSpam.warnings.length > 0) && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  liveSpam.blockers.length > 0
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                <p className="font-medium">
                  {liveSpam.blockers.length > 0
                    ? "Blocks saving"
                    : "Deliverability warnings"}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {[...liveSpam.blockers, ...liveSpam.warnings].map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                Advanced (A/B variants)
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="subject-b"
                    className="mb-1 block text-xs font-medium text-zinc-600"
                  >
                    Subject B
                  </label>
                  <input
                    id="subject-b"
                    value={active.subjectB ?? ""}
                    onChange={(e) => updateActive({ subjectB: e.target.value })}
                    disabled={threadedSubject}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                    placeholder={
                      threadedSubject ? "Ignored while threading is on" : "Optional"
                    }
                  />
                </div>
                <div>
                  <label
                    htmlFor="body-b"
                    className="mb-1 block text-xs font-medium text-zinc-600"
                  >
                    Body B
                  </label>
                  <textarea
                    id="body-b"
                    value={active.bodyB ?? ""}
                    onChange={(e) => updateActive({ bodyB: e.target.value })}
                    rows={5}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="winner"
                    className="mb-1 block text-xs font-medium text-zinc-600"
                  >
                    Force winner
                  </label>
                  <select
                    id="winner"
                    value={active.winner ?? ""}
                    onChange={(e) => updateActive({ winner: e.target.value })}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="">Auto random</option>
                    <option value="A">Always A</option>
                    <option value="B">Always B</option>
                  </select>
                </div>
              </div>
            </details>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900">
                Live preview
              </h3>
              {(active.subjectB?.trim() || active.bodyB?.trim()) && (
                <div className="flex gap-1">
                  {(["A", "B"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setPreviewVariant(v)}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        previewVariant === v
                          ? "bg-zinc-900 text-white"
                          : "border border-zinc-300 text-zinc-600 hover:bg-white"
                      }`}
                    >
                      Variant {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              Sample: {sampleLead.firstName} {sampleLead.lastName} @{" "}
              {sampleLead.company}
            </p>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Subject
            </p>
            <p className="mb-4 text-sm font-medium text-zinc-900">
              {previewSubject || "(empty)"}
            </p>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Body
            </p>
            {looksLikeHtml(previewBody) ? (
              <div
                className="prose prose-sm max-w-none rounded-md border border-zinc-100 bg-white p-3 text-sm text-zinc-800"
                dangerouslySetInnerHTML={{
                  __html: previewBody || "<p>(empty)</p>",
                }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800">
                {previewBody || "(empty)"}
              </pre>
            )}
          </div>
        </div>
      )}

      {flash && <p className={flashClass(flash.tone)}>{flash.text}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => void saveSteps()}
          disabled={saving || !dirty}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : dirty ? "Save sequence" : "Saved"}
        </button>

        <div>
          <label
            htmlFor="test-to"
            className="mb-1 block text-xs font-medium text-zinc-600"
          >
            Send a test of {mailTabLabel(activeIndex)} to
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="test-to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@email.com"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={saving}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Send test
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Saves the sequence first — a test always sends the stored version.
          </p>
        </div>
      </div>
    </div>
  );
}
