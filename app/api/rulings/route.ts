/**
 * Draft, then sign. confirm:true uses the transcript already stored on the session.
 * The browser cannot send a day of its own and have it filed.
 */
import { readCookie } from "@/lib/auth";
import {
  loadExperts,
  loadRulings,
  rulingToSource,
  saveRulings,
  signRuling,
} from "@/lib/corpus";
import { draftRulingFromTranscript } from "@/lib/deposition";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { transcriptInputSchema } from "@/lib/types";
import { DEPOSITION_COOKIE, readWitnessSession, saveTranscript, sealWitnessSession } from "@/lib/witness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sessionOr401(request: Request) {
  const sessionId = readCookie(request.headers.get("cookie") ?? "", DEPOSITION_COOKIE);
  const session = readWitnessSession(sessionId);
  return { sessionId, session };
}

export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(`ruling:${clientIp(request)}`, Date.now(), 10).ok) {
    return jsonError(429, "RATE_LIMITED", "Too many ruling requests. Try again in a minute.");
  }
  const { sessionId, session } = sessionOr401(request);
  if (!session || !sessionId) return jsonError(401, "UNAUTHORIZED", "Open the deposition link again.");
  if (session.sealed) return jsonError(410, "REUSED", "This deposition link has already been used.");

  try {
    const body = await readJson(request, 16_000);
    const confirm = body && typeof body === "object" && "confirm" in body && body.confirm === true;
    const parsed = transcriptInputSchema.safeParse(body);
    if (!parsed.success && !confirm) return jsonError(400, "BAD_REQUEST", "Invalid ruling request.");

    const experts = loadExperts();
    const expert = experts.find((item) => item.id === session.payload.expertId);
    if (!expert?.canSignRulings) return jsonError(403, "FORBIDDEN", "That person cannot sign a ruling.");

    if (!confirm) {
      const transcript = parsed.success ? parsed.data.answers.join("\n") : "";
      saveTranscript(sessionId, transcript);
      const draft = draftRulingFromTranscript({
        transcript,
        expert,
        context: session.context,
        sourceIds: session.payload.objectionIds,
      });
      if (!draft) {
        return jsonError(422, "UNGROUNDED", "The transcript does not state a cut-off day, so no ruling was drafted.");
      }
      return Response.json({ draft, mode: "review" }, { headers: { "Cache-Control": "no-store" } });
    }

    if (!session.transcript) return jsonError(409, "NOT_READY", "Draft a ruling from the transcript before signing.");
    const draft = draftRulingFromTranscript({
      transcript: session.transcript,
      expert,
      context: session.context,
      sourceIds: session.payload.objectionIds,
    });
    if (!draft) return jsonError(422, "UNGROUNDED", "The transcript does not state a cut-off day, so no ruling was drafted.");

    const unsigned = {
      ...draft,
      id: `ruling-${draft.transcriptHash.slice(0, 12)}`,
      question: session.question,
      context: session.context,
      signedAt: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    };
    const ruling = { ...unsigned, signature: signRuling(unsigned) };
    const existing = loadRulings().filter((item) => item.id !== ruling.id);
    saveRulings([...existing, ruling]);
    sealWitnessSession(sessionId);
    return Response.json(
      { ruling, source: rulingToSource(ruling, expert.name) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    console.error("ruling failed");
    return jsonError(500, "INTERNAL", "The ruling could not be saved.");
  }
}
