import { wordFromClaims } from "@/lib/engine/output-guard";
import { claimFromText } from "@/lib/engine/cutoff";
import type { LlmClient } from "@/lib/llm/client";
import type { Claim } from "@/lib/types";

export function claimFromSource(source: { id: string; text: string }): Claim | null {
  return claimFromText(source.id, source.text);
}

export const mockLlmClient: LlmClient = {
  async complete(args) {
    if (args.purpose === "extract") {
      const claims: Claim[] = [];
      for (const source of args.sources) {
        const claim = claimFromSource(source);
        if (claim) claims.push(claim);
      }
      return { claims };
    }
    return { answer: wordFromClaims(args.claims) };
  },
};
