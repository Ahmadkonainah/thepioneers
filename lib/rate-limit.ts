const hits = new Map<string, number[]>();

export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 60_000;

/**
 * Fixed window per IP. WHY the header is not trusted on its own in production:
 * the platform in front of this app must overwrite X-Forwarded-For. A client
 * that can choose the header can otherwise rotate past the limit.
 */
export function rateLimit(
  ip: string,
  now = Date.now(),
  limit = RATE_LIMIT,
  windowMs = RATE_WINDOW_MS,
): { ok: boolean; remaining: number } {
  const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return { ok: false, remaining: 0 };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { ok: true, remaining: limit - recent.length };
}

export function resetRateLimit(): void {
  hits.clear();
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip") ?? "local";
}
