"use client";

/**
 * The case file. Dials debounce into POST /api/ask.
 * Call the witness only navigates. It does not sign anything.
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEMO_AS_OF, DEMO_QUESTION } from "@/lib/demo";
import type { AskResponse, Context, Persona, Verdict } from "@/lib/types";

const COUNTRIES = [
  { value: "BE", label: "Belgium" },
  { value: "NL", label: "Netherlands" },
  { value: "DE", label: "Germany" },
] as const;

const PLANS = ["Standard", "Flex"] as const;

const PERSONAS: { id: Persona; label: string }[] = [
  { id: "consultant", label: "Consultant BE" },
  { id: "finance", label: "Finance" },
  { id: "expert", label: "Expert" },
];

const VERDICT_STYLE: Record<Verdict, { label: string; className: string; sentence: string }> = {
  ACT: {
    label: "Act",
    className: "border-emerald-800 bg-emerald-100 text-emerald-950",
    sentence: "The record supports this answer.",
  },
  ACT_WITH_CARE: {
    label: "Act with care",
    className: "border-amber-800 bg-amber-100 text-amber-950",
    sentence: "You can use this answer, but a warning is still open.",
  },
  VERIFY_FIRST: {
    label: "Verify first",
    className: "border-red-800 bg-red-100 text-red-950",
    sentence: "Do not act yet. A critical challenge is still open.",
  },
};

interface ApiError {
  error: { code: string; message: string };
}

export function CaseFile() {
  const [question, setQuestion] = useState(DEMO_QUESTION);
  const [country, setCountry] = useState<Context["country"]>("BE");
  const [plan, setPlan] = useState<Context["plan"]>("Standard");
  const [asOf, setAsOf] = useState(DEMO_AS_OF);
  const [persona, setPersona] = useState<Persona>("consultant");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  useEffect(() => {
    void fetch("/api/session")
      .then((response) => response.json())
      .then((body: { persona?: Persona }) => {
        if (body.persona === "consultant" || body.persona === "finance" || body.persona === "expert") {
          setPersona(body.persona);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void run(controller.signal);
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // The dials and the question are the whole request. Re-run when any of them change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, country, plan, asOf, persona]);

  async function run(signal?: AbortSignal) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context: { country, plan, asOf } }),
        signal,
      });
      const body = (await response.json()) as AskResponse | ApiError;
      if (!response.ok || !("verdict" in body)) {
        setResult(null);
        setError("error" in body ? body.error.message : "The question could not be cross-examined.");
        return;
      }
      setResult(body);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("The question could not be cross-examined.");
    } finally {
      if (!signal?.aborted) setPending(false);
    }
  }

  /** The cookie is set by the server. Local state updates only after that succeeds. */
  async function switchPersona(next: Persona) {
    setError(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: next }),
    });
    if (!response.ok) {
      setError("The persona could not be switched.");
      return;
    }
    setPersona(next);
  }

  /** Ask the server for a signed link. The expert id comes from the objection, not from a free-text field. */
  async function callWitness(expertId: string, sourceIds: string[]) {
    const response = await fetch("/api/witness/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expertId,
        objectionIds: sourceIds.length > 0 ? sourceIds : [expertId],
        question,
        context: { country, plan, asOf },
      }),
    });
    const body = (await response.json()) as { path?: string; error?: { message: string } };
    if (!response.ok || !body.path) {
      setError(body.error?.message ?? "The witness link could not be created.");
      return;
    }
    window.location.assign(body.path);
  }

  const stamp = result ? VERDICT_STYLE[result.verdict] : null;
  const sentence =
    result && result.verdict === "VERIFY_FIRST" && result.answer.length === 0
      ? "Nothing in scope answers this. The tool will not guess."
      : stamp?.sentence;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-foreground/15 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Synthetic payroll bureau</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight md:text-5xl">Burden of Proof</h1>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Persona">
          {PERSONAS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={persona === item.id ? "default" : "outline"}
              aria-pressed={persona === item.id}
              onClick={() => void switchPersona(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <form
          className="flex flex-col gap-4 lg:col-span-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <h2 className="font-serif text-2xl">Question</h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              value={country}
              onChange={(event) => setCountry(event.target.value as Context["country"])}
            >
              {COUNTRIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan">Plan</Label>
            <select
              id="plan"
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
              value={plan}
              onChange={(event) => setPlan(event.target.value as Context["plan"])}
            >
              {PLANS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="asOf">As of</Label>
            <input
              id="asOf"
              type="date"
              required
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="question">What do you need to know?</Label>
            <Textarea id="question" required minLength={8} value={question} onChange={(event) => setQuestion(event.target.value)} />
          </div>
          <Button type="submit">Cross-examine</Button>
        </form>

        <section className="flex flex-col gap-5 lg:col-span-8" aria-live="polite">
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-red-50 px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {pending && !result ? <Skeleton /> : null}
          {stamp && result ? (
            <>
              <div data-testid="verdict" className={`stamp rounded-md border-2 px-4 py-3 font-serif text-2xl ${stamp.className}`}>
                {stamp.label}
              </div>
              <p className="text-lg">{sentence}</p>
              {result.answer ? (
                <p data-testid="answer" className="text-base leading-relaxed">
                  {result.answer}{" "}
                  {result.evidence
                    .filter((item) => item.survived)
                    .map((item) => (
                      <span key={item.sourceId} className="mx-1 inline-flex rounded-sm border bg-card px-2 py-0.5 text-sm">
                        {item.title}
                      </span>
                    ))}
                </p>
              ) : null}
              <p className="font-mono text-xs text-muted-foreground" data-testid="custody">
                {result.custody.checked} sources checked · {result.custody.quarantined} quarantined ·{" "}
                {result.custody.restricted} restricted (not shown) · sealed with SHA-256 {result.custody.sha256.slice(0, 12)} ·{" "}
                extractor {result.extractor}
              </p>
              <h2 className="font-serif text-2xl">Cross-examination</h2>
              <ul className="flex flex-col gap-3">
                {result.objections.map((objection, index) => (
                  <li
                    key={`${objection.type}-${objection.message}`}
                    className="objection-card rounded-md border bg-card p-4"
                    style={{ animationDelay: `${index * 150}ms` }}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={objection.severity}>{objection.type}</Badge>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">{objection.severity}</span>
                    </div>
                    <p>{objection.message}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{objection.whatWouldResolve}</p>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-medium">Evidence</summary>
                      <EvidenceDrawer objectionSourceIds={objection.sourceIds} result={result} />
                    </details>
                    {objection.resolvableBy ? (
                      <Button
                        type="button"
                        className="mt-3"
                        variant="outline"
                        onClick={() => void callWitness(objection.resolvableBy!, objection.sourceIds)}
                      >
                        Call the witness
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {result.superseded.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Superseded</h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {result.superseded.map((note) => (
                      <li key={note.sourceId} className="rounded-md border border-dashed px-3 py-2 text-sm">
                        {note.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** Quote, owner, age, and hash. Quarantined sources show that the text was withheld, not the text. */
function EvidenceDrawer({ objectionSourceIds, result }: { objectionSourceIds: string[]; result: AskResponse }) {
  const ids = objectionSourceIds.length > 0 ? objectionSourceIds : [];
  const rows = result.dossier.filter((entry) => ids.includes(entry.id));
  if (rows.length === 0) return <p className="mt-2 text-sm text-muted-foreground">No source text is attached to this objection.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {rows.map((entry) => {
        const quote = result.evidence.find((item) => item.sourceId === entry.id);
        return (
          <li key={entry.id} className="rounded-md bg-background/70 p-3 text-sm">
            <p className="font-medium">{entry.title}</p>
            {quote && !entry.quarantined ? <p className="mt-1 italic">&ldquo;{quote.quote}&rdquo;</p> : null}
            {entry.quarantined ? <p className="mt-1">Text withheld. The source was quarantined.</p> : null}
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {entry.owner ? `owner ${entry.owner} · ` : "no owner · "}
              {entry.ageDays} days old · {entry.contentHash.slice(0, 12)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Placeholder while the first exam is in flight. Hidden from assistive tech because the region is aria-live. */
function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-12 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-6 w-full animate-pulse rounded-md bg-muted" />
      <div className="h-24 w-full animate-pulse rounded-md bg-muted" />
    </div>
  );
}
