/** Mint a deposition link. Questions are rebuilt from the corpus so the client cannot supply the quotes. */
import { readPersonaFromRequest } from "@/lib/auth";
import { loadCaseFile, loadExperts } from "@/lib/corpus";
import { buildDepositionQuestions } from "@/lib/deposition";
import { prepareCorpus } from "@/lib/engine/judge";
import { claimFromText } from "@/lib/engine/cutoff";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { witnessLinkInputSchema } from "@/lib/types";
import { createWitnessLink } from "@/lib/witness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(`witness:${clientIp(request)}`, Date.now(), 10).ok) {
    return jsonError(429, "RATE_LIMITED", "Too many witness requests. Try again in a minute.");
  }
  try {
    readPersonaFromRequest(request);
  } catch {
    return jsonError(500, "MISCONFIGURED", "SESSION_SECRET is not configured.");
  }

  try {
    const body = await readJson(request, 16_000);
    const parsed = witnessLinkInputSchema.safeParse(body);
    if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Invalid witness request.");

    const experts = loadExperts();
    const expert = experts.find((item) => item.id === parsed.data.expertId);
    if (!expert?.canSignRulings) {
      return jsonError(403, "FORBIDDEN", "That person cannot sign a ruling.");
    }

    // Rebuild the case as the expert. Do not trust quotes supplied by the browser.
    const file = loadCaseFile();
    const prepared = prepareCorpus(file.sources, "expert", parsed.data.context, parsed.data.question);
    const claims = prepared.forModel.flatMap((source) => {
      const claim = claimFromText(source.id, source.text);
      return claim ? [claim] : [];
    });
    const titles = new Map(prepared.allowed.map((source) => [source.id, source.title]));
    const questions = buildDepositionQuestions(claims, titles);
    const link = createWitnessLink({
      objectionIds: parsed.data.objectionIds,
      expertId: expert.id,
      context: parsed.data.context,
      question: parsed.data.question,
      questions,
    });

    return Response.json(
      { path: `/deposition/${link.token}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    console.error("witness link failed");
    return jsonError(500, "INTERNAL", "The witness link could not be created.");
  }
}
