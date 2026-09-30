/** Cross-examine one question. The persona comes from the signed cookie, not from the JSON body. */
import { runAsk } from "@/lib/ask";
import { readPersonaFromRequest } from "@/lib/auth";
import { loadCaseFile, loadExperts } from "@/lib/corpus";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { getLlmClient, LlmError } from "@/lib/llm";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { askInputSchema } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY = 32_000;

export async function POST(request: Request): Promise<Response> {
  const limit = rateLimit(`ask:${clientIp(request)}`);
  if (!limit.ok) return jsonError(429, "RATE_LIMITED", "Too many questions. Try again in a minute.");

  let persona;
  try {
    persona = readPersonaFromRequest(request);
  } catch {
    return jsonError(500, "MISCONFIGURED", "SESSION_SECRET is not configured.");
  }

  try {
    const body = await readJson(request, MAX_BODY);
    const parsed = askInputSchema.safeParse(body);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join(".")).filter((field) => field.length > 0);
      return jsonError(400, "BAD_REQUEST", fields.length > 0 ? `Invalid input: ${fields.join(", ")}.` : "Invalid question or context.");
    }
    const file = loadCaseFile();
    const result = await runAsk({
      question: parsed.data.question,
      context: parsed.data.context,
      persona,
      sources: file.sources,
      rulings: file.rulings,
      experts: loadExperts(),
      client: getLlmClient(),
    });
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-RateLimit-Remaining": String(limit.remaining),
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    if (error instanceof LlmError) return jsonError(502, error.code, error.message);
    console.error("ask failed");
    return jsonError(500, "INTERNAL", "The question could not be cross-examined.");
  }
}
