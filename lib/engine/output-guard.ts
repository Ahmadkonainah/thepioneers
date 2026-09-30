import { injectionFindings } from "@/lib/engine/injection";
import { cutoffDay } from "@/lib/engine/cutoff";
import type { Claim, Objection, Source } from "@/lib/types";

export const SAFE_NO_CUTOFF =
  "No claim survived cross-examination, so no cut-off date is stated. Resolve the open objections before acting.";

export function wordFromClaims(claims: readonly Claim[]): string {
  const days = claims
    .filter((claim) => claim.field === "cutoff_day")
    .map((claim) => cutoffDay(claim.value))
    .filter((day): day is number => day !== null);
  const unique = [...new Set(days)];
  const day = unique[0];
  if (!day || unique.length !== 1) return SAFE_NO_CUTOFF;
  return `The payroll-change cut-off is the ${day}th.`;
}

function mentionedDays(answer: string): number[] {
  const days: number[] = [];
  for (const match of answer.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi)) {
    const raw = match[1];
    if (!raw) continue;
    const day = Number(raw);
    if (day >= 1 && day <= 31) days.push(day);
  }
  return days;
}

function allowedDays(claims: readonly Claim[]): Set<number> {
  const days = new Set<number>();
  for (const claim of claims) {
    if (claim.field !== "cutoff_day") continue;
    const day = cutoffDay(claim.value);
    if (day !== null) days.add(day);
  }
  return days;
}

/**
 * The model may word an answer. It may not introduce a cut-off the engine rejected,
 * and it may not repeat instruction-like text.
 */
export function guardAnswer(
  answer: string,
  surviving: readonly Claim[],
): { answer: string; objection: Objection | null } {
  const invented = mentionedDays(answer).some((day) => !allowedDays(surviving).has(day));
  const injected = injectionFindings(answer).length > 0;
  if (!invented && !injected) return { answer, objection: null };
  return {
    answer: SAFE_NO_CUTOFF,
    objection: {
      type: "INTEGRITY",
      severity: "critical",
      sourceIds: [],
      message: invented
        ? "The drafted answer was discarded because it stated a cut-off that no surviving claim supports."
        : "The drafted answer was discarded because it contained instruction-like content.",
      whatWouldResolve: "Keep the answer limited to grounded surviving claims.",
    },
  };
}

/** Defense in depth: if restricted text leaked into the answer, drop the answer. Do not quote the leak. */
export function answerLeaksRestricted(
  answer: string,
  restricted: readonly Source[],
  visible: readonly Source[],
): boolean {
  const visibleBlob = visible.map((source) => source.text).join("\n");
  for (const source of restricted) {
    if (answer.includes(source.text)) return true;
    const compact = source.text.replace(/\s+/g, " ");
    for (let index = 0; index + 24 <= compact.length; index += 12) {
      const slice = compact.slice(index, index + 24);
      if (!visibleBlob.includes(slice) && answer.includes(slice)) return true;
    }
  }
  return false;
}

export function restrictedLeakObjection(): Objection {
  return {
    type: "INTEGRITY",
    severity: "critical",
    sourceIds: [],
    message: "The drafted answer was discarded because it included text from a restricted source.",
    whatWouldResolve: "Regenerate the answer from accessible sources only.",
  };
}
