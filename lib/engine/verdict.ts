import type { Objection, Verdict } from "@/lib/types";

export function verdict(objections: readonly Objection[]): Verdict {
  if (objections.some((objection) => objection.severity === "critical")) return "VERIFY_FIRST";
  if (objections.some((objection) => objection.severity === "warn")) return "ACT_WITH_CARE";
  return "ACT";
}

/** No in-scope claim is a refusal to guess, even though the GAP itself is only a warning. */
export function decideVerdict(objections: readonly Objection[], noInScopeClaims: boolean): Verdict {
  if (noInScopeClaims) return "VERIFY_FIRST";
  return verdict(objections);
}
