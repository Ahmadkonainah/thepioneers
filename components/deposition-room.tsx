"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Context, RulingDraft } from "@/lib/types";

interface Opened {
  expertId: string;
  questions: string[];
  context: Context;
}

export function DepositionRoom({ token }: { token: string }) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"voice" | "typed">("voice");
  const [answers, setAnswers] = useState<string[]>([]);
  const [draft, setDraft] = useState<RulingDraft | null>(null);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/deposition/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as Opened & { error?: { message: string } };
        if (!response.ok) {
          setError(body.error?.message ?? "This deposition link could not be opened.");
          return;
        }
        setOpened(body);
        setAnswers(body.questions.map(() => ""));
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError("This deposition link could not be opened.");
      });
    return () => controller.abort();
  }, [token]);

  async function play(question: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: question }),
      });
      if (!response.ok) {
        setMode("typed");
        setError("Voice playback is unavailable. Typed answers are active.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    } catch {
      setMode("typed");
      setError("Voice playback is unavailable. Typed answers are active.");
    } finally {
      setBusy(false);
    }
  }

  async function record(index: number) {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMode("typed");
      setError("This browser has no microphone. Typed answers are active.");
      return;
    }
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      window.setTimeout(() => recorder.stop(), 8000);
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      const response = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      if (!response.ok) {
        setMode("typed");
        setError("Transcription is unavailable. Typed answers are active.");
        return;
      }
      const body = (await response.json()) as { transcript?: string };
      setAnswers((current) => current.map((answer, item) => (item === index ? body.transcript ?? answer : answer)));
      setMode("voice");
    } catch {
      setMode("typed");
      setError("The microphone could not be used. Typed answers are active.");
    } finally {
      setBusy(false);
    }
  }

  async function draftRuling() {
    if (!opened) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/rulings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const body = (await response.json()) as { draft?: RulingDraft; error?: { message: string } };
    setBusy(false);
    if (!response.ok || !body.draft) {
      setError(body.error?.message ?? "No ruling was drafted.");
      return;
    }
    setDraft(body.draft);
  }

  async function sign() {
    setBusy(true);
    const response = await fetch("/api/rulings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true, answers }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message: string } };
      setError(body.error?.message ?? "The ruling was not signed.");
      return;
    }
    setSigned(true);
  }

  if (error && !opened) {
    return (
      <p className="mt-6 rounded-md border border-destructive/40 bg-red-50 px-4 py-3 text-sm" role="alert">
        {error}
      </p>
    );
  }
  if (!opened) return <div className="mt-6 h-24 animate-pulse rounded-md bg-muted" aria-hidden="true" />;

  return (
    <div className="mt-6 flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Mode: {mode === "voice" ? "Voice" : "Typed fallback"}. Witness {opened.expertId}. Nothing is filed until you
        click Sign ruling.
      </p>
      {error ? (
        <p className="rounded-md border border-amber-700/40 bg-amber-50 px-4 py-3 text-sm" role="status">
          {error}
        </p>
      ) : null}
      <ol className="flex flex-col gap-5">
        {opened.questions.map((question, index) => (
          <li key={question} className="rounded-md border bg-card p-4">
            <p className="font-medium">{question}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => void play(question)}>
                Play question
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void record(index)}>
                Record answer
              </Button>
            </div>
            <label className="mt-3 block text-sm" htmlFor={`answer-${index}`}>
              Answer
              <textarea
                id={`answer-${index}`}
                className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={answers[index] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => current.map((answer, item) => (item === index ? event.target.value : answer)))
                }
              />
            </label>
          </li>
        ))}
      </ol>
      <Button type="button" disabled={busy} onClick={() => void draftRuling()}>
        Draft ruling
      </Button>
      {draft ? (
        <article className="rounded-md border bg-card p-4">
          <h2 className="font-serif text-2xl">Proposed ruling</h2>
          <p className="mt-2">
            Cut-off day {draft.value}, {draft.scope.countries === "*" ? "all countries" : draft.scope.countries.join(", ")}{" "}
            {draft.scope.plans === "*" ? "all plans" : draft.scope.plans.join(", ")}, from {draft.validFrom}.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{draft.quote}</p>
          <Button type="button" className="mt-4" disabled={busy || signed} onClick={() => void sign()}>
            {signed ? "Ruling signed" : "Sign ruling"}
          </Button>
          {signed ? (
            <p className="mt-3 text-sm" role="status">
              Signed and filed. Return to the case file and cross-examine again.
            </p>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}
