import { cutoffDay } from "@/lib/engine/cutoff";
import { sha256 } from "@/lib/hash";
import type { Claim, Context, Expert, RulingDraft } from "@/lib/types";

const SUPERSEDED_BE = ["be-procedure-v4", "teams-karim-flex", "be-calendar-2024"];

/** Questions are built here, not taken from the browser, and each one quotes the sources in conflict. */
export function buildDepositionQuestions(claims: readonly Claim[], titles: ReadonlyMap<string, string>): string[] {
  const quoted = claims.slice(0, 3).map((claim) => {
    const title = titles.get(claim.sourceId) ?? claim.sourceId;
    return `"${title}" says "${claim.quote}"`;
  });
  if (quoted.length === 0) {
    return ["Which cut-off day should employees rely on, and from which date?"];
  }
  const pair = quoted.slice(0, 2).join(" ");
  return [
    `${pair}. Which cut-off day applies, and for which plan?`,
    `${pair}. Is any older calendar still in force?`,
    `State one sentence an employee can file. ${pair}.`,
  ].slice(0, quoted.length === 1 ? 2 : 3);
}

/**
 * The day has to be spoken. The signer is the expert on the link, not a name inside the transcript.
 * WHY: a transcript must not be able to appoint a different signer or invent a day.
 */
export function draftRulingFromTranscript(input: {
  transcript: string;
  expert: Expert;
  context: Context;
  sourceIds: readonly string[];
}): RulingDraft | null {
  if (!input.expert.canSignRulings) return null;
  const day = spokenCutoffDay(input.transcript);
  if (day === null) return null;

  const flex = /flex/i.test(input.transcript);
  const plans = flex ? ["Flex"] : input.context.plan === "Flex" ? ["Flex"] : ["Standard"];
  const countries = input.expert.country === "NL" ? ["NL"] : input.context.country === "NL" ? ["NL"] : ["BE"];
  const validFrom = /1\s+sept/i.test(input.transcript) ? "2026-09-01" : input.context.asOf;
  const supersedes = SUPERSEDED_BE.filter((id) => input.sourceIds.includes(id) || countries[0] === "BE");
  const quote = `Signed ruling. The payroll-change cut-off is the ${day}.`;

  return {
    field: "cutoff_day",
    value: day,
    scope: { countries, plans, validFrom },
    validFrom,
    supersedes: countries[0] === "BE" ? supersedes : input.sourceIds.filter((id) => id.startsWith("nl-")),
    givenBy: input.expert.id,
    transcriptHash: sha256(input.transcript),
    quote,
  };
}

function spokenCutoffDay(transcript: string): number | null {
  const explicit = transcript.match(/cut-off(?:\s+\w+){0,6}\s+(\d{1,2})(?:st|nd|rd|th)?/i);
  const day = explicit?.[1] ? Number(explicit[1]) : cutoffDay(transcript);
  if (day === null || day < 1 || day > 31) return null;
  return day;
}
