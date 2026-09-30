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
