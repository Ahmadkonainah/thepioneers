/**
 * The model sees a system string, a user string, and the sources the engine already allowed.
 * Callers pass sources so tests can record the payload. Hosted providers still send only system and user.
 */
import type { Claim, Source } from "@/lib/types";

export interface LlmCompleteArgs {
  system: string;
  user: string;
  purpose: "extract" | "answer";
  sources: readonly Source[];
  claims: readonly Claim[];
}

export interface LlmClient {
  complete(args: LlmCompleteArgs): Promise<unknown>;
}
