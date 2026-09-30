/** Build a source with a real content hash, and a model double that records every string it was given. */
import { sha256 } from "@/lib/hash";
import type { LlmClient } from "@/lib/llm/client";
import type { Context, Source } from "@/lib/types";

export const AS_OF: Context = { country: "BE", plan: "Standard", asOf: "2026-09-30" };

export function makeSource(overrides: Partial<Source> & { id: string; text: string }): Source {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    kind: overrides.kind ?? "procedure",
    owner: overrides.owner,
    updatedAt: overrides.updatedAt ?? "2026-09-01",
    reviewCycleDays: overrides.reviewCycleDays ?? 365,
    scope: overrides.scope ?? { countries: "*", plans: "*" },
    acl: overrides.acl ?? [],
    text: overrides.text,
    contentHash: overrides.contentHash ?? sha256(overrides.text),
  };
}

export function recordingClient(sink: string[], answer?: string): LlmClient {
  return {
    async complete(args) {
      sink.push(args.system);
      sink.push(args.user);
      sink.push(args.sources.map((source) => source.id).join(","));
      sink.push(args.sources.map((source) => source.text).join("\n"));
      if (args.purpose === "extract") return { claims: [] };
      return { answer: answer ?? args.user };
    },
  };
}
