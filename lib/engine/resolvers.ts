import type { Context, Expert, Objection, ObjectionType } from "@/lib/types";

const RESOLVABLE: ReadonlySet<ObjectionType> = new Set(["STALE", "UNOWNED", "UNOFFICIAL", "CONFLICT"]);

/**
 * The witness is the country owner who is allowed to sign.
 * A consultant who only posted in chat is not the accountable owner.
 */
export function resolverFor(experts: readonly Expert[], context: Context): string | undefined {
  return experts.find(
    (expert) =>
      expert.canSignRulings && expert.country === context.country && expert.topics.includes("payroll-cutoff"),
  )?.id;
}

export function assignResolvers(
  objections: readonly Objection[],
  experts: readonly Expert[],
  context: Context,
): Objection[] {
  const expertId = resolverFor(experts, context);
  if (!expertId) return objections.map((objection) => ({ ...objection }));
  return objections.map((objection) => {
    if (!RESOLVABLE.has(objection.type) || objection.resolvableBy) return objection;
    return { ...objection, resolvableBy: expertId };
  });
}
