/**
 * In-memory cache keyed by the question and the content hashes, not by the answer text.
 * A changed document misses the cache. Failures are not stored, so a later retry can succeed.
 */
import { sha256 } from "@/lib/hash";

const cache = new Map<string, unknown>();

export function cacheKey(purpose: string, question: string, hashes: readonly string[], extra = ""): string {
  const joined = [...hashes].sort().join(",");
  return sha256(`${purpose}\n${question}\n${joined}\n${extra}`);
}

export function getCached(key: string): unknown {
  return cache.get(key);
}

export function setCached(key: string, value: unknown): void {
  cache.set(key, value);
}

export function clearLlmCache(): void {
  cache.clear();
}
