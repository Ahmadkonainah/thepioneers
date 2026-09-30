# Burden of Proof

An employee asks a payroll question. Instead of a confidence score, the app cross-examines its own answer and shows which challenges that answer survived. An unresolved challenge can be sent to an accountable expert. The expert's signed ruling becomes scoped knowledge and replaces the conflicting claims.

The people, documents, and company are fictional. Nothing in `data/` is a customer record.

## How this answers the challenge

| | What the build does |
| --- | --- |
| Trust | There is no confidence score. The verdict is Act, Act with care, or Verify first, from objections the engine can show. Restricted text stays out. A ruling is HMAC-signed, and a person must click Sign ruling. |
| Capture | The question, the country, plan, and as-of dials, and an optional voice deposition are captured. Audio is not stored. The ruling keeps a transcript hash. |
| Detect | Before an answer is shown, the engine detects scope misses, stale documents, missing owners, unofficial chat, conflicts, prompt injection, and gaps. |
| Connect | An open challenge connects to the accountable expert for that country. Sofie or Daan can sign. Karim, who only posted in chat, cannot. |

## Demo

Question, with the country left to the dial:

> What is the cut-off date for submitting payroll changes for the monthly run?

As of **2026-09-30**:

| Context | Verdict | Why |
| --- | --- | --- |
| Belgium + Flex | Verify first | The procedure says the 18th. Karim's chat says the 16th. The 2024 calendar is stale and unowned, so it warns instead of joining the conflict. |
| Belgium + Flex, after Sofie's ruling | Act | The signed ruling supersedes the procedure, the chat, and the calendar. |
| Belgium + Standard | Act with care | The answer is the 18th. Karim's message is out of scope. The calendar is stale and unowned. |
| Netherlands | Act | The Dutch procedure (15th) is the only in-scope cut-off. |
| Netherlands, as of 2027-03-15 | Act with care | That procedure is past its 180-day review. |
| Germany | Verify first | Nothing in scope applies, so the tool refuses to guess and returns no answer text. |

Sofie's deposition line, which drafts a Flex ruling for the 16th from 1 September 2026:

> For Belgian Flex customers the cut-off has been the 16th at noon since 1 September. The 2024 calendar is obsolete. Standard stays on the 18th.

Call the witness routes to Sofie Peeters for Belgium and Daan de Vries for the Netherlands. Karim El Amrani posted the Flex chat message and cannot sign (`canSignRulings: false`).

## Run

```bash
cp .env.example .env.local
# Set SESSION_SECRET (at least 16 characters). Leave API keys empty to stay on the mock extractor.
npm install
npm run dev
```

Open the app, leave the demo question in place, and change country, plan, or the as-of date. The cross-examination runs again after a short debounce.

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run reset-demo` | Rewrites `data/rulings.json` to `[]` |

The default model provider is `mock`. It extracts cut-off days with the same patterns the engine trusts, so the dials above are deterministic and do not call a network. If `LLM_PROVIDER=gemini` and that call throws, the same mock extractor answers and the custody line says `mock-fallback`.

## Environment

Copy `.env.example`. Real values belong in `.env.local`, which is gitignored together with `.env` and `.env.*.local`. Never commit a key.

| Variable | Where it is read | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | Server. Signs the persona cookie, witness links, and rulings. | At least 16 characters. |
| `DEMO_MODE` | Server, `POST /api/session` only. | `true` allows the persona switch. Any other value returns 403. |
| `LLM_PROVIDER` | Server. `mock` (default) or `gemini`. | A Gemini error falls back to mock. |
| `GEMINI_API_KEY` | **Only** `lib/llm.ts`, and only on the server. | Sent as a header, never in the URL. Requests set `store: false`. |
| `LLM_MODEL` | Server, Gemini only. | Default `gemini-3.8-flash`. The custody line shows `gemini:<model>`. |
| `ELEVENLABS_API_KEY` | Server, `lib/speech.ts`. | If unset, deposition stays on typed answers and speech routes return 503. |
| `ELEVENLABS_VOICE_ID` | Server. | Optional. A premade voice is used when this is empty. |

`GEMINI_API_KEY` is not a `NEXT_PUBLIC_` variable, so Next.js does not inline it into the browser bundle.

## What you see

- **Persona.** Consultant BE, Finance, or Expert, stored in a signed httpOnly cookie. Switching is allowed only when `DEMO_MODE=true`. A missing or forged cookie fails closed to Consultant, who cannot read finance-only documents.
- **Dials.** Country (BE, NL, DE), plan (Standard, Flex), and an as-of date. Changing one re-runs the exam.
- **Verdict.** Act (green), Act with care (amber), or Verify first (red), plus one plain sentence and the answer with source chips.
- **Cross-examination.** One card per objection: type, severity, what would resolve it, and an evidence drawer (quote, hash, owner, age). Cards stagger by 150ms unless the user prefers reduced motion.
- **Call the witness.** Shown when an objection has an accountable signer. Opens a single-use deposition.
- **Custody line.** How many sources were checked, how many were quarantined, how many were restricted and not shown, a SHA-256 seal, and the extractor (`mock`, `gemini:<model>`, or `mock-fallback`).
- **Footer.** Synthetic demo data. The session cookie is essential and is not used for tracking. Voice is not retained. A ruling is filed only after a person clicks Sign ruling.

The page is one case file: large type, one green accent, no chat bubbles. Controls are keyboard accessible. Loading uses a skeleton. Failures stay on the page as an alert.

## Engine rules

Deterministic decisions live in `lib/engine`. The model only extracts claims and words the surviving answer. Every model output is checked with zod, and a day that no surviving claim supports is discarded.

Severity:

| Objection | Severity | When |
| --- | --- | --- |
| SCOPE | info | The source is outside the selected country, plan, or validity window. |
| STALE | warn | An in-scope, non-quarantined source that contributed a claim is past its review cycle. |
| UNOWNED | warn | That same source has no owner. |
| UNOFFICIAL | warn | That same source is a chat message. |
| CONFLICT | critical | Fresh in-scope claims on `cutoff_day` disagree. Quotes are included. |
| INTEGRITY | info | The source was quarantined. It is logged and never reaches the model. |
| GAP | info | Restricted documents were withheld. The objection is a count only. |
| GAP | warn | No in-scope claim exists. The verdict is Verify first and the answer is empty. |

A stale source cannot create a conflict with a fresh one. A signed ruling whose scope matches the context and field supersedes every other claim on that field. Superseded sources are listed as information and raise no objections.

`cutoff_day` is an integer day of the month. Payslip publication (the 25th) and the expenses deadline (the 5th) are not cut-offs. The poisoned wiki's "25th" is not extracted either.

Verdict: any critical objection forces Verify first; any warning forces Act with care; otherwise Act. No in-scope claim forces Verify first even though that gap is only a warning.

## Access, injection, and custody

1. `filterByAccess` runs first. The persona string must appear in `acl`. An empty list matches nobody. Restricted text, titles, and ids are not returned. The response may say that N restricted sources exist.
2. Injection scanning quarantines hash mismatches, instruction patterns, hidden characters, and "email this to an address" heuristics. Quarantined text is not indexed and is not sent to the model or to speech.
3. Scope, then MiniSearch retrieval. In-scope rulings are not sent to the model. Their claims are taken from the signed ruling object.
4. The custody hash covers the restricted count plus the sorted id and content hash of quarantined and examined sources. Restricted ids are not inside the hash input.

Test hooks in the synthetic corpus:

- `FIN-CONFIDENTIAL-7741` is in the finance-only document. It must not appear in a consultant or expert response.
- `attacker@example.com` is in the poisoned wiki. It must not appear in any model payload.

## Deposition

`POST /api/witness/link` builds a 15-minute link `/deposition/[token]`. The token is HMAC-SHA256 over `{objectionIds, expertId, exp, nonce}`. The question, context, and generated questions stay on the server, keyed by the nonce. Opening the link is idempotent until the ruling is signed, so a refresh does not burn the nonce. After Sign ruling, the nonce is sealed and a second open is rejected. Tampered and expired tokens are rejected.

The page shows two or three questions rebuilt on the server from the open objections. Each question quotes the conflicting sources. Play question calls `POST /api/tts`. Record uses `MediaRecorder` and `POST /api/stt` (5 MB, audio mime allowlist). If the microphone or ElevenLabs is unavailable, typed answers are used and the active mode is shown.

Draft ruling turns the transcript into a zod ruling: field, day, scope, valid-from, superseded source ids, signer, and transcript hash. The day has to be spoken. The signer is the expert on the link, not a name in the transcript. Sign ruling is a separate click. The saved ruling is a `ruling` source owned by that expert, appended to `data/rulings.json` with an HMAC. A hand-edited file does not enter retrieval unless the signature matches `SESSION_SECRET`.

Audio is held in memory for that request and is not written to disk. Only the transcript hash is stored.

## HTTP API

Every route validates input with zod, rate-limits by IP, and caps the body. Responses that fail do not include model or corpus text in the error.

| Route | Limit | Body cap | Returns |
| --- | --- | --- | --- |
| `POST /api/ask` | 20/min | 32 KB | `{answer, evidence, objections, superseded, dossier, verdict, custody, extractor}` |
| `GET`/`POST /api/session` | 20/min | 2 KB | Sets or reads the persona cookie. |
| `POST /api/witness/link` | 10/min | 16 KB | `{path}` for an expert who can sign. |
| `POST /api/deposition/open` | 20/min | 8 KB | Questions for a valid token, plus the deposition cookie. |
| `POST /api/tts` | 20/min | 8 KB | MPEG audio for a question already on the session. |
| `POST /api/stt` | 10/min | 5 MB | Transcript. Mime types: webm, wav, mpeg, mp4, ogg. |
| `POST /api/rulings` | 10/min | 16 KB | A draft, or a signed ruling when `confirm` is true. |

Security headers on every path: Content-Security-Policy (`frame-ancestors 'none'`), `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and a microphone permission limited to this origin. Production script policy does not allow `eval`. Development allows it so React Refresh can run.

## Layout

```
app/                 pages and route handlers
components/          case file, deposition room, small UI primitives
data/sources.json    12 synthetic sources, loaded and validated, not regenerated
data/experts.json    Sofie, Karim, Daan, Femke
data/rulings.json    signed rulings, initially empty
lib/engine/          pure cross-examination
lib/llm.ts           claim extraction, answer wording, Gemini key
lib/witness.ts       signed single-use links
lib/speech.ts        ElevenLabs, server-side SDK only
tests/               one test per objection, the dial matrix, exfiltration, signed links
SECURITY.md          threat model, ten rows
```

## Privacy and EU constraints

- Synthetic names only. No customer database.
- The persona cookie and the deposition cookie are httpOnly, SameSite=Lax, and essential. They are not used for tracking. The deposition cookie lasts 15 minutes.
- Restricted and quarantined document text is not rendered.
- Voice audio is not stored. Speech runs only when a key is configured, and only the generated question is sent, never a corpus document.
- Gemini requests opt out of provider-side storage (`store: false`).
- A human must click Sign ruling. The model cannot file a ruling by itself.
- Document text is untrusted. It is wrapped in `<source>` blocks and is never copied into the system prompt.

## Tests

`npm test` covers each objection type, the dial matrix, a ruling that clears a conflict, injection text staying out of the model payload, the finance canary staying out of consultant responses, crafted exfiltration questions, tampered, expired, and reused witness links, the ask rate limit, and the Gemini key staying in a header rather than the URL.

The test setup forces `LLM_PROVIDER=mock` when it is unset, and clears the model cache, rate-limit window, and witness nonces before each test.
