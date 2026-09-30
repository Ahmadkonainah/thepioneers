/** Switch the signed persona cookie. The body is only the role name. It cannot carry documents. */
import { personaCookieHeader, readPersonaFromRequest } from "@/lib/auth";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { personaSchema } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!rateLimit(`session:${clientIp(request)}`).ok) {
    return jsonError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.");
  }
  try {
    return Response.json(
      { persona: readPersonaFromRequest(request) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError(500, "MISCONFIGURED", "SESSION_SECRET is not configured.");
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(`session:${clientIp(request)}`).ok) {
    return jsonError(429, "RATE_LIMITED", "Too many requests. Try again in a minute.");
  }
  try {
    const body = await readJson(request, 2_000);
    if (!body || typeof body !== "object" || !("persona" in body)) {
      return jsonError(400, "BAD_REQUEST", "Invalid input: persona.");
    }
    const parsed = personaSchema.safeParse(body.persona);
    if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Invalid input: persona.");
    return Response.json(
      { persona: parsed.data },
      { headers: { "Cache-Control": "no-store", "Set-Cookie": personaCookieHeader(parsed.data) } },
    );
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    return jsonError(500, "MISCONFIGURED", "SESSION_SECRET is not configured.");
  }
}
