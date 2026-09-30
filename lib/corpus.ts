import fs from "node:fs";
import path from "node:path";
import { sessionSecret } from "@/lib/auth";
import { hmacSha256, safeEqual, sha256 } from "@/lib/hash";
import {
  expertSchema,
  rulingSchema,
  sourceSchema,
  type Expert,
  type Ruling,
  type Source,
} from "@/lib/types";

/**
 * WHY: readFileSync must not take a path built from a parameter. Aikido treats that
 * parameter as attacker-controlled even after an allowlist. Each seed is a literal.
 */
const SOURCES_FILE = path.join(process.cwd(), "data", "sources.json");
const EXPERTS_FILE = path.join(process.cwd(), "data", "experts.json");
const RULINGS_FILE = path.join(process.cwd(), "data", "rulings.json");

function readSourcesJson(): unknown {
  return JSON.parse(fs.readFileSync(SOURCES_FILE, "utf8")) as unknown;
}

function readExpertsJson(): unknown {
  return JSON.parse(fs.readFileSync(EXPERTS_FILE, "utf8")) as unknown;
}

function readRulingsJson(): unknown {
  return JSON.parse(fs.readFileSync(RULINGS_FILE, "utf8")) as unknown;
}

/** Rejects anything other than the three seed leaves. This check is not used to build a path. */
export function assertSeedName(name: string): "sources.json" | "experts.json" | "rulings.json" {
  if (name === "sources.json" || name === "experts.json" || name === "rulings.json") return name;
  throw new Error("Refusing to read a path outside the seed directory.");
}

export function loadSources(): Source[] {
  return sourceSchema.array().parse(readSourcesJson());
}

export function loadExperts(): Expert[] {
  return expertSchema.array().parse(readExpertsJson());
}

export function loadRulings(): Ruling[] {
  return rulingSchema.array().parse(readRulingsJson());
}

/** Stable bytes for the HMAC. Array order must not change the signature, so superseded ids are sorted. */
export function canonicalRuling(ruling: Omit<Ruling, "signature">): string {
  return JSON.stringify({
    id: ruling.id,
    question: ruling.question,
    context: ruling.context,
    field: ruling.field,
    value: ruling.value,
    scope: ruling.scope,
    validFrom: ruling.validFrom,
    supersedes: [...ruling.supersedes].sort(),
    givenBy: ruling.givenBy,
    transcriptHash: ruling.transcriptHash,
    quote: ruling.quote,
    signedAt: ruling.signedAt,
  });
}

export function signRuling(ruling: Omit<Ruling, "signature">, secret = sessionSecret()): string {
  return hmacSha256(canonicalRuling(ruling), secret);
}

export function rulingIsAuthentic(ruling: Ruling, secret = sessionSecret()): boolean {
  return safeEqual(signRuling(ruling, secret), ruling.signature);
}

/** A signed ruling becomes an ordinary source. Its text is the short quote, not the raw transcript. */
export function rulingToSource(ruling: Ruling, ownerName = ruling.givenBy): Source {
  return {
    id: ruling.id,
    title: `Signed ruling by ${ownerName}`,
    kind: "ruling",
    owner: ownerName,
    updatedAt: ruling.signedAt.slice(0, 10),
    reviewCycleDays: 365,
    scope: { ...ruling.scope, validFrom: ruling.scope.validFrom ?? ruling.validFrom },
    // A signed ruling is scoped knowledge for every persona. It contains no finance-only text.
    acl: ["consultant", "expert", "finance"],
    text: ruling.quote,
    contentHash: sha256(ruling.quote),
  };
}

/** Write via a temp file and rename so a crash cannot leave a half-written rulings file. */
export function saveRulings(rulings: readonly Ruling[]): void {
  const file = RULINGS_FILE;
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(rulings, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

export function loadCaseFile(): { sources: Source[]; rulings: Ruling[] } {
  const sources = loadSources();
  const experts = loadExperts();
  let secret: string;
  try {
    secret = sessionSecret();
  } catch {
    return { sources, rulings: [] };
  }
  const rulings = loadRulings().filter((ruling) => rulingIsAuthentic(ruling, secret));
  const names = new Map(experts.map((expert) => [expert.id, expert.name]));
  return {
    sources: [
      ...sources,
      ...rulings.map((ruling) => rulingToSource(ruling, names.get(ruling.givenBy) ?? ruling.givenBy)),
    ],
    rulings,
  };
}

/**
 * WHY: rulings become scoped knowledge only when the HMAC matches SESSION_SECRET.
 * Editing rulings.json by hand must not put unsigned text into retrieval.
 */
export function loadCorpus(): Source[] {
  return loadCaseFile().sources;
}
