import { cacheKey, getCached, setCached } from "@/lib/llm/cache";
import type { LlmClient } from "@/lib/llm/client";
import { buildAnswerUser, buildExtractUser, SYSTEM_ANSWER, SYSTEM_EXTRACT } from "@/lib/llm/prompt";
import { getLlmClient as getHostedClient, LlmError } from "@/lib/llm/providers";
import { claimSchema, type Claim, type Source } from "@/lib/types";
import { z } from "zod";

const claimListSchema = z.object({ claims: z.array(claimSchema) }).strict();
const answerPayloadSchema = z.object({ answer: z.string().min(1).max(4000) }).strict();

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Label stored on the ask response. The model id is the configured one, not a name returned by Gemini. */
export function configuredExtractor(): "mock" | `gemini:${string}` {
  if ((process.env.LLM_PROVIDER ?? "mock") !== "gemini") return "mock";
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return `gemini:${model}`;
}

export { LlmError } from "@/lib/llm/providers";
export type { LlmClient } from "@/lib/llm/client";

if (typeof window !== "undefined") {
  throw new Error("lib/llm.ts runs on the server only.");
}

/**
 * WHY: GEMINI_API_KEY is read only in this module, and it is not a NEXT_PUBLIC_ variable,
 * so Next.js does not inline it into the browser bundle. The value is sent as a header,
 * never as a query parameter that access logs would keep.
 */
function readGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmError("LLM_UNAVAILABLE", "GEMINI_API_KEY is not set.");
  return key;
}

export function geminiRequestBody(system: string, user: string, model: string) {
  return {
    model,
    system_instruction: system,
    input: user,
    // WHY: store false asks Gemini not to retain the payroll question. EU data minimisation.
    store: false,
    generation_config: { thinking_level: "low" as const },
  };
}

function parseModelJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM response was not JSON.");
  }
}

function readGeminiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM response was not JSON.");
  }
  const record = payload as { output_text?: unknown; steps?: unknown };
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text.trim();
  if (!Array.isArray(record.steps) || record.steps.length === 0) {
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM response missing content.");
  }
  const last = record.steps[record.steps.length - 1];
  if (!last || typeof last !== "object") {
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM response missing content.");
  }
  const content = (last as { content?: unknown }).content;
  const parts = Array.isArray(content) ? content : [content];
  const texts = parts.flatMap((part) => {
    if (typeof part === "string") return [part];
    if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
      return [(part as { text: string }).text];
    }
    return [];
  });
  const joined = texts.join("").trim();
  if (!joined) throw new LlmError("LLM_INVALID_OUTPUT", "LLM response missing content.");
  return joined;
}

function geminiClient(): LlmClient {
  return {
    async complete({ system, user }) {
      const key = readGeminiApiKey();
      const model = process.env.LLM_MODEL || DEFAULT_GEMINI_MODEL;
      let response: Response;
      try {
        response = await fetch(GEMINI_ENDPOINT, {
          method: "POST",
          headers: {
            "x-goog-api-key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(geminiRequestBody(system, user, model)),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new LlmError("LLM_UNAVAILABLE", "LLM request failed.");
      }
      if (!response.ok) throw new LlmError("LLM_UNAVAILABLE", `LLM HTTP ${response.status}.`);
      let payload: unknown;
      try {
        payload = (await response.json()) as unknown;
      } catch {
        throw new LlmError("LLM_INVALID_OUTPUT", "LLM response was not JSON.");
      }
      return parseModelJson(readGeminiText(payload));
    },
  };
}

export function getLlmClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? "mock";
  if (provider === "gemini") return geminiClient();
  if (provider === "mock") return getHostedClient();
  throw new LlmError("LLM_UNAVAILABLE", `Unknown LLM_PROVIDER "${provider}".`);
}

function coerceClaimList(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !("claims" in raw)) return raw;
  const claims = (raw as { claims?: unknown }).claims;
  if (!Array.isArray(claims)) return raw;
  return {
    claims: claims.map((claim) => {
      if (!claim || typeof claim !== "object") return claim;
      const record = claim as Record<string, unknown>;
      const field =
        record.field === "payroll.cutoff" || record.field === "cut-off" || record.field === "cutoff"
          ? "cutoff_day"
          : record.field;
      const value = typeof record.value === "number" ? String(record.value) : record.value;
      return { ...record, field, value };
    }),
  };
}

async function complete(client: LlmClient, args: Parameters<LlmClient["complete"]>[0]): Promise<unknown> {
  try {
    return await client.complete(args);
  } catch (error) {
    if (error instanceof LlmError) throw error;
    const message = error instanceof Error ? error.message : "LLM request failed.";
    throw new LlmError("LLM_UNAVAILABLE", message);
  }
}

export async function extractClaims(
  question: string,
  sources: readonly Source[],
  client: LlmClient = getLlmClient(),
): Promise<Claim[]> {
  const system = SYSTEM_EXTRACT;
  const user = buildExtractUser(question, sources);
  const key = cacheKey(
    "extract",
    question,
    sources.map((source) => source.contentHash),
  );
  const cached = getCached(key);
  if (cached) return claimListSchema.parse(cached).claims;

  const raw = await complete(client, { system, user, purpose: "extract", sources, claims: [] });
  const parsed = claimListSchema.safeParse(coerceClaimList(raw));
  if (!parsed.success) {
    // WHY: model output is untrusted and may repeat a payload. Keep the error generic.
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM claim output failed schema validation.");
  }
  setCached(key, parsed.data);
  return parsed.data.claims;
}

export async function writeAnswer(
  question: string,
  survivingClaims: readonly Claim[],
  client: LlmClient = getLlmClient(),
): Promise<string> {
  const system = SYSTEM_ANSWER;
  const user = buildAnswerUser(question, survivingClaims);
  const key = cacheKey(
    "answer",
    question,
    survivingClaims.map((claim) => `${claim.sourceId}:${claim.field}:${claim.value}`),
    user,
  );
  const cached = getCached(key);
  if (cached) return answerPayloadSchema.parse(cached).answer;

  const raw = await complete(client, {
    system,
    user,
    purpose: "answer",
    sources: [],
    claims: survivingClaims,
  });
  const parsed = answerPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM answer output failed schema validation.");
  }
  setCached(key, parsed.data);
  return parsed.data.answer;
}
