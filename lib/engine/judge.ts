import { filterByAccess } from "@/lib/engine/access";
import { detectConflicts } from "@/lib/engine/conflicts";
import { claimFromText, cutoffDay, quoteSupportsCutoff } from "@/lib/engine/cutoff";
import { ageInDays, isStale } from "@/lib/engine/freshness";
import { groundClaims } from "@/lib/engine/grounding";
import { injectionScan } from "@/lib/engine/injection";
import { retrieve } from "@/lib/engine/retrieve";
import { assignResolvers } from "@/lib/engine/resolvers";
import { scopeCheck, sourceInScope } from "@/lib/engine/scope";
import { decideVerdict } from "@/lib/engine/verdict";
import type {
  Claim,
  Context,
  DossierEntry,
  Evidence,
  Expert,
  Objection,
  Persona,
  Ruling,
  Source,
  SupersededNote,
  Verdict,
} from "@/lib/types";

export interface PreparedCorpus {
  forModel: Source[];
  objections: Objection[];
  quarantined: Source[];
  restrictedCount: number;
  allowed: Source[];
  inScope: Source[];
}

/**
 * Access, quarantine, and scope finish before anything is indexed or modelled.
 * Quarantined text is not inserted into the search index.
 */
export function prepareCorpus(
  sources: readonly Source[],
  persona: Persona,
  context: Context,
  question: string,
): PreparedCorpus {
  const access = filterByAccess(sources, persona);
  const scanned = injectionScan(access.allowed);
  const scoped = scopeCheck(scanned.clean, context);
  const documents = scoped.inScope.filter((source) => source.kind !== "ruling");
  const rulings = scoped.inScope.filter((source) => source.kind === "ruling");
  const retrieved = retrieve(documents, question);

  return {
    forModel: retrieved,
    objections: [
      ...(access.objection ? [access.objection] : []),
      ...scanned.objections,
      ...scoped.objections,
    ],
    quarantined: scanned.quarantined,
    restrictedCount: access.restrictedCount,
    allowed: access.allowed,
    inScope: [...retrieved, ...rulings],
  };
}

/** Keep a claim only when its quote is an exact cut-off excerpt of a source we sent to the model. */
export function acceptClaims(claims: readonly Claim[], sources: readonly Source[]): Claim[] {
  const grounded = groundClaims(claims, sources);
  return grounded.accepted.filter(
    (claim) => claim.field === "cutoff_day" && quoteSupportsCutoff(claim.quote) && cutoffDay(claim.value) !== null,
  );
}

/** Ruling claims come from the signed object, not from a second model pass. */
export function claimsFromRulings(rulings: readonly Ruling[], context: Context): Claim[] {
  const claims: Claim[] = [];
  for (const ruling of rulings) {
    if (!rulingInContext(ruling, context)) continue;
    claims.push({
      sourceId: ruling.id,
      field: "cutoff_day",
      value: String(ruling.value),
      quote: ruling.quote,
    });
  }
  return claims;
}

/** A ruling applies when the as-of date is on or after validFrom and the scope matches the dials. */
export function rulingInContext(ruling: Ruling, context: Context): boolean {
  if (context.asOf < ruling.validFrom) return false;
  return sourceInScope(
    {
      id: ruling.id,
      title: ruling.id,
      kind: "ruling",
      updatedAt: ruling.signedAt.slice(0, 10),
      reviewCycleDays: 365,
      scope: ruling.scope,
      acl: [],
      text: ruling.quote,
      contentHash: "0".repeat(64),
    },
    context,
  );
}

export interface Judgement {
  objections: Objection[];
  evidence: Evidence[];
  superseded: SupersededNote[];
  dossier: DossierEntry[];
  verdict: Verdict;
  answerClaims: Claim[];
  noInScopeClaims: boolean;
}

/**
 * Apply a matching ruling first, then warn only on sources that still contribute a claim.
 * Conflicts are computed on fresh claims, so a stale calendar cannot force Verify first by itself.
 */
export function judge(input: {
  extracted: readonly Claim[];
  modelSources: readonly Source[];
  allowed: readonly Source[];
  quarantined: readonly Source[];
  rulings: readonly Ruling[];
  experts: readonly Expert[];
  context: Context;
  preliminary: readonly Objection[];
}): Judgement {
  const accepted = acceptClaims(input.extracted, input.modelSources);
  const rulingClaims = claimsFromRulings(input.rulings, input.context);
  const matchingRulings = input.rulings.filter((ruling) => rulingInContext(ruling, input.context));
  const supersededIds = new Set<string>();
  const superseded: SupersededNote[] = [];

  let active = accepted;
  if (matchingRulings.length > 0) {
    for (const claim of accepted) supersededIds.add(claim.sourceId);
    for (const ruling of matchingRulings) {
      for (const sourceId of ruling.supersedes) supersededIds.add(sourceId);
    }
    active = rulingClaims;
    for (const sourceId of supersededIds) {
      const source = input.allowed.find((item) => item.id === sourceId);
      superseded.push({
        sourceId,
        title: source?.title ?? sourceId,
        message: `"${source?.title ?? sourceId}" is superseded by a signed ruling and raises no further objection.`,
      });
    }
  }

  const byId = new Map(input.allowed.map((source) => [source.id, source]));
  const contributingIds = [...new Set(active.map((claim) => claim.sourceId))];
  const objections: Objection[] = [...input.preliminary];

  for (const sourceId of contributingIds) {
    if (supersededIds.has(sourceId)) continue;
    const source = byId.get(sourceId);
    if (!source || source.kind === "ruling") continue;
    if (isStale(source, input.context.asOf)) {
      const age = ageInDays(source.updatedAt, input.context.asOf);
      objections.push({
        type: "STALE",
        severity: "warn",
        sourceIds: [source.id],
        message: `"${source.title}" is ${age} days old, past its ${source.reviewCycleDays}-day review cycle.`,
        whatWouldResolve: "The owner re-confirms the document or a signed ruling replaces it.",
      });
    }
    if (!source.owner) {
      objections.push({
        type: "UNOWNED",
        severity: "warn",
        sourceIds: [source.id],
        message: `"${source.title}" has no accountable owner.`,
        whatWouldResolve: "An owner adopts the document, or a signed ruling supersedes it.",
      });
    }
    if (source.kind === "chat") {
      objections.push({
        type: "UNOFFICIAL",
        severity: "warn",
        sourceIds: [source.id],
        message: `"${source.title}" is a chat message, not a controlled procedure.`,
        whatWouldResolve: "The procedure owner publishes the change or signs a ruling.",
      });
    }
  }

  const freshIds = new Set(
    contributingIds.filter((sourceId) => {
      const source = byId.get(sourceId);
      if (!source) return true;
      return !isStale(source, input.context.asOf);
    }),
  );
  objections.push(...detectConflicts(active, freshIds));

  const noInScopeClaims = active.length === 0;
  if (noInScopeClaims) {
    objections.push({
      type: "GAP",
      severity: "warn",
      sourceIds: [],
      message: "No in-scope source states a payroll cut-off for this context.",
      whatWouldResolve: "Change the country or plan, or obtain a scoped ruling.",
    });
  }

  const resolved = assignResolvers(objections, input.experts, input.context);
  const conflict = resolved.some((objection) => objection.type === "CONFLICT");
  const freshClaims = active.filter((claim) => freshIds.has(claim.sourceId));
  const staleClaims = active.filter((claim) => !freshIds.has(claim.sourceId));
  const answerClaims = conflict ? [] : freshClaims.length > 0 ? freshClaims : staleClaims;

  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  for (const claim of [...accepted, ...active]) {
    const key = `${claim.sourceId}:${claim.quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const source = byId.get(claim.sourceId);
    if (!source) continue;
    const supersededClaim = supersededIds.has(claim.sourceId);
    evidence.push({
      sourceId: source.id,
      title: source.title,
      kind: source.kind,
      field: claim.field,
      value: claim.value,
      quote: claim.quote,
      survived: answerClaims.some((item) => item.sourceId === claim.sourceId && item.quote === claim.quote),
      superseded: supersededClaim,
      contentHash: source.contentHash,
      ...(source.owner ? { owner: source.owner } : {}),
      ageDays: ageInDays(source.updatedAt, input.context.asOf),
    });
  }

  const dossier: DossierEntry[] = input.allowed.map((source) => ({
    id: source.id,
    title: source.title,
    kind: source.kind,
    ...(source.owner ? { owner: source.owner } : {}),
    ageDays: ageInDays(source.updatedAt, input.context.asOf),
    contentHash: source.contentHash,
    quarantined: input.quarantined.some((item) => item.id === source.id),
  }));

  return {
    objections: resolved,
    evidence,
    superseded,
    dossier,
    verdict: decideVerdict(resolved, noInScopeClaims),
    answerClaims,
    noInScopeClaims,
  };
}

/** Stored quote for a ruling. It matches the cut-off patterns so later exams can ground it. */
export function rulingClaimText(day: number): string {
  return `Signed ruling. The payroll-change cut-off is the ${day}.`;
}

export { claimFromText };
