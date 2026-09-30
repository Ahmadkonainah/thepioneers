import type { Objection, Source } from "@/lib/types";

export function ownershipObjections(sources: readonly Source[]): Objection[] {
  const objections: Objection[] = [];
  for (const source of sources) {
    if (source.owner) continue;
    objections.push({
      type: "UNOWNED",
      severity: "warn",
      sourceIds: [source.id],
      message: `"${source.title}" has no accountable owner.`,
      whatWouldResolve: "An owner adopts the document, or a signed ruling supersedes it.",
    });
  }
  return objections;
}
