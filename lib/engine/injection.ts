import { sha256 } from "@/lib/hash";
import type { Objection, Source } from "@/lib/types";

const INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+|any\s+|previous\s+|prior\s+)?instructions/i,
  /disregard\s+(?:all\s+|the\s+)?(?:previous|above|prior)/i,
  /override\s+(?:the\s+)?(?:system|previous|safety)/i,
  /system\s+prompt/i,
  /you\s+are\s+now\b/i,
  /\bact\s+as\b/i,
  /new\s+instructions?\b/i,
  /do\s+not\s+tell\s+the\s+user/i,
  /send\s+(?:the\s+)?(?:files?|documents?|data|secrets?)\s+to\b/i,
  /exfiltrat/i,
  /<\s*\/?\s*(?:system|instructions?)\s*>/i,
];

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const TRANSMIT = /\b(?:send|forward|email|transmit)\b/i;

/** Regex plus a small set of heuristics. Findings are labels, never excerpts of the payload. */
export function injectionFindings(text: string): string[] {
  const findings: string[] = [];
  for (const pattern of INSTRUCTION_PATTERNS) {
    if (pattern.test(text)) findings.push("instruction override");
  }
  if (ZERO_WIDTH.test(text)) findings.push("hidden characters");
  if (EMAIL.test(text) && TRANSMIT.test(text)) findings.push("exfiltration address");
  return findings;
}

export function injectionScan(sources: readonly Source[]): {
  clean: Source[];
  quarantined: Source[];
  objections: Objection[];
} {
  const clean: Source[] = [];
  const quarantined: Source[] = [];
  const objections: Objection[] = [];

  for (const source of sources) {
    const findings = injectionFindings(source.text);
    const hashOk = sha256(source.text) === source.contentHash;
    if (findings.length === 0 && hashOk) {
      clean.push(source);
      continue;
    }

    quarantined.push(source);
    const reason = !hashOk
      ? "content hash does not match the stored text"
      : "prompt-injection patterns were detected";
    objections.push({
      type: "INTEGRITY",
      // Info, not critical: the source is contained. It never reaches retrieval or the model.
      severity: "info",
      sourceIds: [source.id],
      // WHY: echoing the payload would copy the attack into the UI and into any later prompt.
      message: `"${source.title}" was quarantined: ${reason}.`,
      whatWouldResolve: "The owner replaces the document with a clean, re-hashed version.",
    });
  }

  return { clean, quarantined, objections };
}
