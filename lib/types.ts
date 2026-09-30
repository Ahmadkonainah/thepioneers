import { z } from "zod";

export const sourceKindSchema = z.enum(["procedure", "wiki", "chat", "calendar", "ruling"]);
export const countrySchema = z.enum(["BE", "NL", "DE"]);
export const planSchema = z.enum(["Standard", "Flex"]);
export const personaSchema = z.enum(["consultant", "finance", "expert"]);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scopeList = z.union([z.literal("*"), z.array(z.string().min(1)).min(1)]);

export const sourceScopeSchema = z.object({
  countries: scopeList,
  plans: scopeList,
  validFrom: isoDate.optional(),
  validTo: isoDate.optional(),
});

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: sourceKindSchema,
  owner: z.string().min(1).optional(),
  updatedAt: isoDate,
  reviewCycleDays: z.number().int().positive(),
  scope: sourceScopeSchema,
  acl: z.array(z.string().min(1)),
  text: z.string().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});

/** cutoff_day is an integer day of the month. Other fields stay strings until a ruling defines them. */
export const claimSchema = z.object({
  sourceId: z.string().min(1),
  field: z.string().min(1),
  value: z.string().min(1),
  quote: z.string().min(1),
});

export const objectionTypeSchema = z.enum([
  "SCOPE",
  "STALE",
  "UNOWNED",
  "CONFLICT",
  "UNOFFICIAL",
  "INTEGRITY",
  "GAP",
]);

export const severitySchema = z.enum(["info", "warn", "critical"]);

export const objectionSchema = z.object({
  type: objectionTypeSchema,
  severity: severitySchema,
  sourceIds: z.array(z.string()),
  message: z.string().min(1),
  whatWouldResolve: z.string().min(1),
  resolvableBy: z.string().min(1).optional(),
});

export const verdictSchema = z.enum(["ACT", "ACT_WITH_CARE", "VERIFY_FIRST"]);

export const contextSchema = z.object({
  country: countrySchema,
  plan: planSchema,
  asOf: isoDate,
});

export const expertSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  country: countrySchema,
  topics: z.array(z.string().min(1)).min(1),
  canSignRulings: z.boolean(),
  ownsSources: z.array(z.string()),
});

export const rulingDraftSchema = z.object({
  field: z.literal("cutoff_day"),
  value: z.number().int().min(1).max(31),
  scope: sourceScopeSchema,
  validFrom: isoDate,
  supersedes: z.array(z.string().min(1)),
  givenBy: z.string().min(1),
  transcriptHash: z.string().regex(/^[a-f0-9]{64}$/),
  quote: z.string().min(1).max(4000),
});

export const rulingSchema = rulingDraftSchema.extend({
  id: z.string().min(1),
  question: z.string().min(1),
  context: contextSchema,
  signedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/),
  signature: z.string().min(1),
});

export const askInputSchema = z.object({
  question: z.string().trim().min(8).max(2000),
  context: contextSchema,
});

export const evidenceSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  kind: sourceKindSchema,
  field: z.string(),
  value: z.string(),
  quote: z.string(),
  survived: z.boolean(),
  superseded: z.boolean(),
  contentHash: z.string(),
  owner: z.string().optional(),
  ageDays: z.number().int(),
});

export const dossierEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: sourceKindSchema,
  owner: z.string().optional(),
  ageDays: z.number().int(),
  contentHash: z.string(),
  quarantined: z.boolean(),
});

export const supersededSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  message: z.string(),
});

export const custodySchema = z.object({
  checked: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  restricted: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const askResponseSchema = z.object({
  answer: z.string(),
  evidence: z.array(evidenceSchema),
  objections: z.array(objectionSchema),
  superseded: z.array(supersededSchema),
  dossier: z.array(dossierEntrySchema),
  verdict: verdictSchema,
  custody: custodySchema,
});

export const witnessLinkInputSchema = z.object({
  expertId: z.string().min(1),
  objectionIds: z.array(z.string().min(1)).min(1).max(20),
  question: z.string().trim().min(8).max(2000),
  context: contextSchema,
});

export const ttsInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const transcriptInputSchema = z.object({
  answers: z.array(z.string().trim().min(1).max(4000)).min(1).max(3),
});

export type Source = z.infer<typeof sourceSchema>;
export type SourceKind = z.infer<typeof sourceKindSchema>;
export type SourceScope = z.infer<typeof sourceScopeSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Objection = z.infer<typeof objectionSchema>;
export type ObjectionType = z.infer<typeof objectionTypeSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type RulingDraft = z.infer<typeof rulingDraftSchema>;
export type Ruling = z.infer<typeof rulingSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Expert = z.infer<typeof expertSchema>;
export type Persona = z.infer<typeof personaSchema>;
export type AskInput = z.infer<typeof askInputSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type DossierEntry = z.infer<typeof dossierEntrySchema>;
export type SupersededNote = z.infer<typeof supersededSchema>;
export type Custody = z.infer<typeof custodySchema>;
export type AskResponse = z.infer<typeof askResponseSchema>;
