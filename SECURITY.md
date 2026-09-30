# Security

Burden of Proof is a synthetic demo. It stores no customer data and no real personal data. The controls below are what the code actually does.

| Asset | Threat | Mitigation | File |
| --- | --- | --- | --- |
| Finance-only procedure | A question tricks the model into quoting it | Allow-list runs before retrieval and before any model call. Responses report a count only | `lib/engine/access.ts` |
| Poisoned wiki page | Indirect prompt injection | Regex and heuristics quarantine the source. Its text never enters a prompt or speech request | `lib/engine/injection.ts` |
| Persona cookie | Forged or missing session | HMAC-SHA256, httpOnly, fail closed to consultant | `lib/auth.ts` |
| Witness link | Tampering, expiry, replay | Signed payload, 15-minute expiry, nonce rejected after the deposition is sealed | `lib/witness.ts` |
| Signed ruling | Hand-edited `rulings.json` | A ruling enters the corpus only when its HMAC matches `SESSION_SECRET` | `lib/corpus.ts` |
| Voice audio | Retention of a voice recording | Audio is held in memory for one request and is not written to disk. The ruling stores a transcript hash | `lib/speech.ts` |
| API abuse | Flooding or oversized bodies | Per-route IP limits and byte caps, including 5MB and a mime allowlist for audio | `lib/rate-limit.ts`, `lib/http.ts` |
| Browser embedding | Clickjacking, MIME sniffing | CSP `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer` | `next.config.ts` |
| Secrets | Key copied into client code or committed | `GEMINI_API_KEY` is read only in `lib/llm.ts` on the server. `.env` and `.env.local` are gitignored | `lib/llm.ts`, `.gitignore` |
| Model answer | Invented or leaked cut-off | Output is zod-validated, quotes must be exact, and a day that no surviving claim supports is discarded | `lib/llm.ts`, `lib/engine/output-guard.ts` |
