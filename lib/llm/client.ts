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
