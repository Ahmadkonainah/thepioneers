import { canonicalField } from "@/lib/engine/normalize";
import type { Claim, Source } from "@/lib/types";

function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Drop claims the model cannot point at inside a source we actually supplied. */
export function groundClaims(
  claims: readonly Claim[],
  sources: readonly Source[],
): { accepted: Claim[]; rejected: number } {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const accepted: Claim[] = [];
  let rejected = 0;

  for (const claim of claims) {
    const source = byId.get(claim.sourceId);
    const quote = squash(claim.quote);
    if (!source || !quote || !squash(source.text).includes(quote)) {
      rejected += 1;
      continue;
    }
    accepted.push({ ...claim, field: canonicalField(claim.field) });
  }

  return { accepted, rejected };
}
