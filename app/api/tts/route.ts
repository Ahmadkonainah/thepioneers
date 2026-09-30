import { readCookie } from "@/lib/auth";
import { HttpError, jsonError, readJson } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { synthesizeSpeech, SpeechUnavailable } from "@/lib/speech";
import { ttsInputSchema } from "@/lib/types";
import { DEPOSITION_COOKIE, readWitnessSession } from "@/lib/witness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(`tts:${clientIp(request)}`).ok) {
    return jsonError(429, "RATE_LIMITED", "Too many speech requests. Try again in a minute.");
  }
  const session = readWitnessSession(readCookie(request.headers.get("cookie") ?? "", DEPOSITION_COOKIE));
  if (!session) return jsonError(401, "UNAUTHORIZED", "Open the deposition link again.");

  try {
    const parsed = ttsInputSchema.safeParse(await readJson(request, 8_000));
    if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Invalid speech request.");
    if (!session.questions.includes(parsed.data.text)) {
      return jsonError(400, "BAD_REQUEST", "Only a deposition question can be read aloud.");
    }
    const audio = await synthesizeSpeech(parsed.data.text);
    return new Response(Buffer.from(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    if (error instanceof SpeechUnavailable) return jsonError(503, "SPEECH_UNAVAILABLE", error.message);
    console.error("tts failed");
    return jsonError(503, "SPEECH_UNAVAILABLE", "Speech service is not available.");
  }
}
