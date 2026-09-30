import type { Objection, Persona, Source } from "@/lib/types";

/**
 * Allow-list. The persona name must appear in acl. An empty acl matches nobody.
 * WHY: finance material is named in the corpus. Default-open would leak it if an acl were dropped.
 * This runs before retrieval and before any model call. The objection is a count only:
 * no id, title, quote, or reference code. Severity is info because the gap is contained.
 */
export function filterByAccess(
  sources: readonly Source[],
  role: Persona,
): { allowed: Source[]; restrictedCount: number; objection: Objection | null } {
  const allowed: Source[] = [];
  let restrictedCount = 0;

  for (const source of sources) {
    if (source.acl.includes(role)) allowed.push(source);
    else restrictedCount += 1;
  }

  if (restrictedCount === 0) {
    return { allowed, restrictedCount, objection: null };
  }

  const noun = restrictedCount === 1 ? "source" : "sources";
  return {
    allowed,
    restrictedCount,
    objection: {
      type: "GAP",
      severity: "info",
      sourceIds: [],
      message: `${restrictedCount} restricted ${noun} excluded before retrieval.`,
      whatWouldResolve: "Someone in an authorised group reviews the withheld sources, or access is granted.",
    },
  };
}
