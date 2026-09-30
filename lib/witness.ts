import { randomBytes } from "node:crypto";
import { base64urlDecode, base64urlEncode, hmacSha256, safeEqual } from "@/lib/hash";
import { sessionSecret } from "@/lib/auth";
import type { Context } from "@/lib/types";
import { z } from "zod";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const witnessPayloadSchema = z.object({
  objectionIds: z.array(z.string().min(1)).min(1).max(20),
  expertId: z.string().min(1),
  exp: z.number().int(),
  nonce: z.string().min(16),
});

export type WitnessPayload = z.infer<typeof witnessPayloadSchema>;

export interface WitnessSession {
  payload: WitnessPayload;
  context: Context;
  question: string;
  questions: string[];
  transcript?: string;
  draftQuote?: string;
  sealed: boolean;
}

const consumedNonces = new Set<string>();
const pending = new Map<string, Omit<WitnessSession, "payload" | "sealed"> & { payload: WitnessPayload }>();
const sessions = new Map<string, WitnessSession>();
const sessionByNonce = new Map<string, { sessionId: string; session: WitnessSession }>();

export function resetWitnessStore(): void {
  consumedNonces.clear();
  pending.clear();
  sessions.clear();
  sessionByNonce.clear();
}

/** The token carries ids, expert, expiry, and nonce. The question text stays in server memory. */
export function signWitnessToken(payload: WitnessPayload, secret = sessionSecret()): string {
  const body = base64urlEncode(JSON.stringify(payload));
  return `${body}.${hmacSha256(body, secret)}`;
}

export function readWitnessToken(token: string, now = Date.now()): WitnessPayload | "tampered" | "expired" {
  const parts = token.split(".");
  const body = parts[0];
  const sig = parts[1];
  if (!body || !sig || parts.length !== 2) return "tampered";
  const expected = hmacSha256(body, sessionSecret());
  if (!safeEqual(sig, expected)) return "tampered";
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(body)) as unknown;
  } catch {
    return "tampered";
  }
  const result = witnessPayloadSchema.safeParse(parsed);
  if (!result.success) return "tampered";
  if (result.data.exp < now) return "expired";
  return result.data;
}

export function createWitnessLink(input: {
  objectionIds: string[];
  expertId: string;
  context: Context;
  question: string;
  questions: string[];
  now?: number;
}): { token: string; nonce: string } {
  const now = input.now ?? Date.now();
  const nonce = randomBytes(16).toString("hex");
  const payload: WitnessPayload = {
    objectionIds: input.objectionIds,
    expertId: input.expertId,
    exp: now + FIFTEEN_MINUTES_MS,
    nonce,
  };
  pending.set(nonce, {
    payload,
    context: input.context,
    question: input.question,
    questions: input.questions,
  });
  return { token: signWitnessToken(payload), nonce };
}

/**
 * Opening a link consumes its nonce. A second presentation is rejected.
 * The browser session cookie is what later calls use, so a refresh of the
 * token itself cannot mint a second deposition.
 */
export function openWitnessLink(token: string, now = Date.now()): { sessionId: string; session: WitnessSession } | "tampered" | "expired" | "reused" {
  const payload = readWitnessToken(token, now);
  if (payload === "tampered" || payload === "expired") return payload;
  if (consumedNonces.has(payload.nonce)) return "reused";
  const stored = pending.get(payload.nonce);
  if (!stored) return "reused";
  consumedNonces.add(payload.nonce);
  pending.delete(payload.nonce);
  const sessionId = randomBytes(16).toString("hex");
  const session: WitnessSession = { ...stored, payload, sealed: false };
  sessions.set(sessionId, session);
  sessionByNonce.set(payload.nonce, { sessionId, session });
  return { sessionId, session };
}

/** Resume the same unsealed deposition. A sealed nonce cannot be opened again. */
export function resumeWitnessLink(
  token: string,
  now = Date.now(),
): { sessionId: string; session: WitnessSession } | "tampered" | "expired" | "reused" {
  const payload = readWitnessToken(token, now);
  if (payload === "tampered" || payload === "expired") return payload;
  const existing = sessionByNonce.get(payload.nonce);
  if (existing) return existing.session.sealed ? "reused" : existing;
  return openWitnessLink(token, now);
}

export function sealWitnessSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.sealed = true;
}

export function readWitnessSession(sessionId: string | undefined, now = Date.now()): WitnessSession | null {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.payload.exp < now) return null;
  return session;
}

export function saveTranscript(sessionId: string, transcript: string): WitnessSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.transcript = transcript;
  return session;
}

export const DEPOSITION_COOKIE = "bop_deposition";

export function depositionCookieHeader(sessionId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${DEPOSITION_COOKIE}=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=900${secure}`;
}
