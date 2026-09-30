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
 * Seed files are parsed on every read so a bad edit fails closed instead of reaching the model.
 * WHY: the file name used to be a parameter joined onto data/. Aikido flagged that as file inclusion.
 * Each branch now opens one literal leaf, and the resolved path must stay inside data/.
 */
const SEED_ROOT = path.resolve(process.cwd(), "data");

function seedFile(name: "sources.json" | "experts.json" | "rulings.json"): string {
  let file: string;
  switch (name) {
    case "sources.json":
      file = path.join(SEED_ROOT, "sources.json");
      break;
    case "experts.json":
      file = path.join(SEED_ROOT, "experts.json");
      break;
    case "rulings.json":
      file = path.join(SEED_ROOT, "rulings.json");
      break;
    default:
      throw new Error("Refusing to read a path outside the seed directory.");
  }
  const resolved = path.resolve(file);
  if (path.dirname(resolved) !== SEED_ROOT) {
    throw new Error("Refusing to read a path outside the seed directory.");
  }
  return resolved;
}

export function assertSeedName(name: string): "sources.json" | "experts.json" | "rulings.json" {
  if (name === "sources.json" || name === "experts.json" || name === "rulings.json") return name;
  throw new Error("Refusing to read a path outside the seed directory.");
}

function readJson(name: "sources.json" | "experts.json" | "rulings.json"): unknown {
  return JSON.parse(fs.readFileSync(seedFile(name), "utf8")) as unknown;
}

export function loadSources(): Source[] {
  return sourceSchema.array().parse(readJson("sources.json"));
}

export function loadExperts(): Expert[] {
  return expertSchema.array().parse(readJson("experts.json"));
}

export function loadRulings(): Ruling[] {
  return rulingSchema.array().parse(readJson("rulings.json"));
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
  const file = seedFile("rulings.json");
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
