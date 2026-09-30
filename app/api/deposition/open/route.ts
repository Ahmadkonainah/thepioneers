import { z } from "zod";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { depositionCookieHeader, resumeWitnessLink } from "@/lib/witness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ token: z.string().min(10).max(4000) });

export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(`deposition:${clientIp(request)}`, Date.now(), 20).ok) {
    return jsonError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.");
  }
  try {
    const parsed = bodySchema.safeParse(await readJson(request, 8_000));
    if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Invalid deposition link.");
    const opened = resumeWitnessLink(parsed.data.token);
    if (opened === "tampered") return jsonError(400, "TAMPERED", "This deposition link is not valid.");
    if (opened === "expired") return jsonError(410, "EXPIRED", "This deposition link has expired.");
    if (opened === "reused") return jsonError(410, "REUSED", "This deposition link has already been used.");
    return Response.json(
      {
        expertId: opened.session.payload.expertId,
        questions: opened.session.questions,
        context: opened.session.context,
      },
      { headers: { "Cache-Control": "no-store", "Set-Cookie": depositionCookieHeader(opened.sessionId) } },
    );
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    return jsonError(500, "MISCONFIGURED", "SESSION_SECRET is not configured.");
  }
}
