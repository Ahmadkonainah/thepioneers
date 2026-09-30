import { cacheKey, getCached, setCached } from "@/lib/llm/cache";
import type { LlmClient } from "@/lib/llm/client";
import { buildAnswerUser, buildExtractUser, SYSTEM_ANSWER, SYSTEM_EXTRACT } from "@/lib/llm/prompt";
import { getLlmClient, LlmError } from "@/lib/llm/providers";
import { claimSchema, type Claim, type Source } from "@/lib/types";
import { z } from "zod";

const claimListSchema = z.object({ claims: z.array(claimSchema) }).strict();
const answerPayloadSchema = z.object({ answer: z.string().min(1).max(4000) }).strict();

export { getLlmClient, LlmError } from "@/lib/llm/providers";
export type { LlmClient } from "@/lib/llm/client";

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
