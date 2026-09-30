import type { Objection, Source } from "@/lib/types";

const DAY_MS = 86_400_000;

/** Age is measured against the as-of dial, not the server clock, so review checks stay repeatable. */
export function ageInDays(updatedAt: string, asOf: string): number {
  const start = Date.parse(`${updatedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return Number.POSITIVE_INFINITY;
  return Math.floor((end - start) / DAY_MS);
}

export function isStale(source: Source, asOf: string): boolean {
  return ageInDays(source.updatedAt, asOf) > source.reviewCycleDays;
}

export function freshnessObjections(sources: readonly Source[], asOf: string): Objection[] {
  const objections: Objection[] = [];
  for (const source of sources) {
    const age = ageInDays(source.updatedAt, asOf);
    if (age <= source.reviewCycleDays) continue;
    objections.push({
      type: "STALE",
      severity: "warn",
      sourceIds: [source.id],
      message: `"${source.title}" is ${age} days old, past its ${source.reviewCycleDays}-day review cycle.`,
      whatWouldResolve: "The owner re-confirms the document or publishes an update.",
    });
  }
  return objections;
}
