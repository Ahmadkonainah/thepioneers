import type { Objection, Source } from "@/lib/types";

export function unofficialObjections(sources: readonly Source[]): Objection[] {
  const objections: Objection[] = [];
  for (const source of sources) {
    if (source.kind !== "chat") continue;
    objections.push({
      type: "UNOFFICIAL",
      severity: "warn",
      sourceIds: [source.id],
      message: `"${source.title}" is a chat message, not controlled documentation.`,
      whatWouldResolve: "The procedure owner publishes the change in an owned procedure or a signed ruling.",
    });
  }
  return objections;
}
