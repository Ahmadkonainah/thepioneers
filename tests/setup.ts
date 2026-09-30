/**
 * Tests stay on the mock extractor unless a case sets another provider itself.
 * Shared stores are cleared so a nonce, cache hit, or rate-limit window cannot leak across files.
 */
import { beforeEach } from "vitest";
import { clearLlmCache } from "@/lib/llm/cache";
import { resetRateLimit } from "@/lib/rate-limit";
import { resetWitnessStore } from "@/lib/witness";

process.env.SESSION_SECRET ??= "test-session-secret-value";
process.env.LLM_PROVIDER ??= "mock";

beforeEach(() => {
  clearLlmCache();
  resetRateLimit();
  resetWitnessStore();
});
