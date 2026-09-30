/** Transcribe one recording. The mime type and the 5 MB cap are checked before the bytes are forwarded. */
import { readCookie } from "@/lib/auth";
import { HttpError, jsonError, readLimitedBody } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { transcribeSpeech, SpeechUnavailable } from "@/lib/speech";
import { DEPOSITION_COOKIE, readWitnessSession, saveTranscript } from "@/lib/witness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUDIO = 5 * 1024 * 1024;
const ALLOWED_MIME = ["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg"];

function allowedMime(value: string): string | null {
  const base = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_MIME.includes(base) ? base : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!rateLimit(`stt:${clientIp(request)}`, Date.now(), 10).ok) {
    return jsonError(429, "RATE_LIMITED", "Too many transcription requests. Try again in a minute.");
  }
  const sessionId = readCookie(request.headers.get("cookie") ?? "", DEPOSITION_COOKIE);
  if (!readWitnessSession(sessionId)) return jsonError(401, "UNAUTHORIZED", "Open the deposition link again.");

  const mime = allowedMime(request.headers.get("content-type") ?? "");
  if (!mime) return jsonError(415, "UNSUPPORTED_MEDIA", "Audio must be webm, wav, mpeg, mp4, or ogg.");

  try {
    const bytes = await readLimitedBody(request, MAX_AUDIO);
    const transcript = await transcribeSpeech(bytes, mime);
    if (sessionId) saveTranscript(sessionId, transcript);
    return Response.json({ transcript, mode: "voice" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error.status, error.code, error.message);
    if (error instanceof SpeechUnavailable) return jsonError(503, "SPEECH_UNAVAILABLE", error.message);
    console.error("stt failed");
    return jsonError(503, "SPEECH_UNAVAILABLE", "Speech service is not available.");
  }
}
