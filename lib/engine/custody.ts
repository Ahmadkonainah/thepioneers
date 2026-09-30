import { sha256 } from "@/lib/hash";
import type { Custody, Source } from "@/lib/types";

function pairs(sources: readonly Source[]): [string, string][] {
  return sources
    .map((source): [string, string] => [source.id, source.contentHash])
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** Binds the response to the bytes the answer was allowed to see. Restricted ids are not included. */
export function buildCustody(input: {
  checked: number;
  quarantined: readonly Source[];
  restricted: number;
  examined: readonly Source[];
}): Custody {
  const canonical = JSON.stringify({
    restricted: input.restricted,
    quarantined: pairs(input.quarantined),
    examined: pairs(input.examined),
  });
  return {
    checked: input.checked,
    quarantined: input.quarantined.length,
    restricted: input.restricted,
    sha256: sha256(canonical),
  };
}
