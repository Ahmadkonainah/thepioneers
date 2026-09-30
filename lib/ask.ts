/**
 * One question through the engine, then the model.
 * Access filtering and quarantine finish inside prepareCorpus, before extractClaims.
 * A conflict or an empty claim set never asks the model to pick a day.
 */
import { buildCustody } from "@/lib/engine/custody";
import { judge, prepareCorpus } from "@/lib/engine/judge";
import {
  answerLeaksRestricted,
  guardAnswer,
  restrictedLeakObjection,
  SAFE_NO_CUTOFF,
} from "@/lib/engine/output-guard";
import { assignResolvers } from "@/lib/engine/resolvers";
import { extractClaims, writeAnswer, type LlmClient } from "@/lib/llm";
import { askResponseSchema, type AskResponse, type Context, type Expert, type Persona, type Ruling, type Source } from "@/lib/types";

const CONFLICT_ANSWER =
  "The in-scope sources do not agree, so no cut-off date is stated.";

export async function runAsk(input: {
  question: string;
  context: Context;
  persona: Persona;
  sources: readonly Source[];
  rulings?: readonly Ruling[];
  experts: readonly Expert[];
  client: LlmClient;
}): Promise<AskResponse> {
  const rulings = input.rulings ?? [];
  const prepared = prepareCorpus(input.sources, input.persona, input.context, input.question);
  const extracted =
    prepared.forModel.length === 0 ? [] : await extractClaims(input.question, prepared.forModel, input.client);

  const judgement = judge({
    extracted,
    modelSources: prepared.forModel,
    allowed: prepared.allowed,
    quarantined: prepared.quarantined,
    rulings,
    experts: input.experts,
    context: input.context,
    preliminary: prepared.objections,
  });

  const allowedIds = new Set(prepared.allowed.map((source) => source.id));
  const restricted = input.sources.filter((source) => !allowedIds.has(source.id));

  // No model call when there is nothing to word, or when a conflict means any day would be a guess.
  let answer = "";
  if (judgement.noInScopeClaims) answer = "";
  else if (judgement.answerClaims.length === 0) answer = CONFLICT_ANSWER;
  else answer = await writeAnswer(input.question, judgement.answerClaims, input.client);

  const guarded = guardAnswer(answer, judgement.answerClaims);
  let objections = judgement.objections;
  answer = guarded.answer;
  if (guarded.objection) {
    objections = assignResolvers([...objections, guarded.objection], input.experts, input.context);
  }
  if (answer && answerLeaksRestricted(answer, restricted, prepared.allowed)) {
    answer = judgement.noInScopeClaims ? "" : SAFE_NO_CUTOFF;
    objections = assignResolvers([...objections, restrictedLeakObjection()], input.experts, input.context);
  }

  const verdict = judgement.noInScopeClaims ? "VERIFY_FIRST" : objections.some((item) => item.severity === "critical")
    ? "VERIFY_FIRST"
    : objections.some((item) => item.severity === "warn")
      ? "ACT_WITH_CARE"
      : "ACT";

  return askResponseSchema.parse({
    answer,
    evidence: judgement.evidence,
    objections,
    superseded: judgement.superseded,
    dossier: judgement.dossier,
    verdict,
    custody: buildCustody({
      checked: prepared.allowed.length,
      quarantined: prepared.quarantined,
      restricted: prepared.restrictedCount,
      examined: prepared.forModel,
    }),
  });
}
