/**
 * Scope is country, plan, and an optional validity window.
 * A miss is information only: the source stays visible as out of scope and does not block Act.
 */
import type { Context, Objection, Source } from "@/lib/types";

export function sourceInScope(source: Source, context: Context): boolean {
  const { scope } = source;
  if (scope.countries !== "*" && !scope.countries.includes(context.country)) return false;
  if (scope.plans !== "*" && !scope.plans.includes(context.plan)) return false;
  if (scope.validFrom && context.asOf < scope.validFrom) return false;
  if (scope.validTo && context.asOf > scope.validTo) return false;
  return true;
}

export function scopeCheck(
  sources: readonly Source[],
  context: Context,
): { inScope: Source[]; objections: Objection[] } {
  const inScope: Source[] = [];
  const objections: Objection[] = [];

  for (const source of sources) {
    if (sourceInScope(source, context)) {
      inScope.push(source);
      continue;
    }
    objections.push({
      type: "SCOPE",
      severity: "info",
      sourceIds: [source.id],
      message: `"${source.title}" is outside the selected country, plan, or validity window.`,
      whatWouldResolve: "Change the context dials, or obtain a ruling scoped to this country and plan.",
    });
  }

  return { inScope, objections };
}
