/**
 * Mock client and the shared LLM error.
 * The hosted Gemini client lives in lib/llm.ts. This file does not read that API key.
 */
import type { LlmClient } from "@/lib/llm/client";
import { mockLlmClient } from "@/lib/llm/mock";

export class LlmError extends Error {
  constructor(
    public readonly code: "LLM_UNAVAILABLE" | "LLM_INVALID_OUTPUT",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Anything other than an explicit Gemini provider stays on the local extractor. */
export function getLlmClient(): LlmClient {
  return mockLlmClient;
}
