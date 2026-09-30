import { cutoffDay } from "@/lib/engine/cutoff";
import type { Claim, Objection } from "@/lib/types";

/**
 * Only fresh in-scope claims can conflict. A stale value is a review problem,
 * not a second current fact, so it must not force VERIFY_FIRST on its own.
 */
export function detectConflicts(claims: readonly Claim[], freshSourceIds: ReadonlySet<string>): Objection[] {
  const fresh = claims.filter(
    (claim) => claim.field === "cutoff_day" && freshSourceIds.has(claim.sourceId),
  );
  const byDay = new Map<number, Claim[]>();
  for (const claim of fresh) {
    const day = cutoffDay(claim.value);
    if (day === null) continue;
    const group = byDay.get(day) ?? [];
    group.push(claim);
    byDay.set(day, group);
  }
  if (byDay.size < 2) return [];

  const quoted = fresh
    .map((claim) => `${claim.sourceId}: "${claim.quote}" (${cutoffDay(claim.value) ?? claim.value})`)
    .join("; ");
  return [
    {
      type: "CONFLICT",
      severity: "critical",
      sourceIds: [...new Set(fresh.map((claim) => claim.sourceId))],
      message: `In-scope sources disagree on the cut-off day. ${quoted}`,
      whatWouldResolve: "The accountable owner signs one ruling that names a single cut-off day.",
    },
  ];
}
