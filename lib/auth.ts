import { base64urlDecode, base64urlEncode, hmacSha256, safeEqual } from "@/lib/hash";
import { personaSchema, type Persona } from "@/lib/types";

/** Persona cookie. The signature covers the role and the expiry, so the client cannot switch role by editing the value. */
export const PERSONA_COOKIE = "bop_persona";
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

interface SessionPayload {
  persona: Persona;
  exp: number;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return secret;
}

export function signSession(persona: Persona, now = Date.now()): string {
  const payload: SessionPayload = { persona, exp: now + TWELVE_HOURS_MS };
  const body = base64urlEncode(JSON.stringify(payload));
  const sig = hmacSha256(body, sessionSecret());
  return `${body}.${sig}`;
}

/** Invalid, expired, or missing cookies fail closed to the consultant persona, which cannot read finance-only sources. */
export function readSession(token: string | undefined, now = Date.now()): Persona {
  if (!token) return "consultant";
  const parts = token.split(".");
  const body = parts[0];
  const sig = parts[1];
  if (!body || !sig || parts.length !== 2) return "consultant";
  const expected = hmacSha256(body, sessionSecret());
  if (!safeEqual(sig, expected)) return "consultant";

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(body)) as unknown;
  } catch {
    return "consultant";
  }
  if (!parsed || typeof parsed !== "object") return "consultant";
  const record = parsed as { persona?: unknown; exp?: unknown };
  const persona = personaSchema.safeParse(record.persona);
  if (!persona.success || typeof record.exp !== "number" || record.exp < now) return "consultant";
  return persona.data;
}

export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return undefined;
}

export function readPersonaFromRequest(request: Request): Persona {
  const header = request.headers.get("cookie") ?? "";
  return readSession(readCookie(header, PERSONA_COOKIE));
}

export function personaCookieHeader(persona: Persona): string {
  const token = signSession(persona);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${PERSONA_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200${secure}`;
}
