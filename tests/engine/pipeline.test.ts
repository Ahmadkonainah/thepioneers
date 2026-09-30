/** The context-dial matrix, including Sofie's ruling and the rule that Karim cannot sign. */
import { describe, expect, it } from "vitest";
import { runAsk } from "@/lib/ask";
import { loadExperts, loadSources, signRuling } from "@/lib/corpus";
import { resolverFor } from "@/lib/engine/resolvers";
import { isStale } from "@/lib/engine/freshness";
import { DEMO_QUESTION, SOFIE_RULING_LINE } from "@/lib/demo";
import { draftRulingFromTranscript } from "@/lib/deposition";
import { mockLlmClient } from "@/lib/llm/mock";
import type { Context, Ruling } from "@/lib/types";

const experts = loadExperts();
const sources = loadSources();
const base: Context = { country: "BE", plan: "Standard", asOf: "2026-09-30" };

function ask(context: Context, rulings: Ruling[] = []) {
  return runAsk({
    question: DEMO_QUESTION,
    context,
    persona: "consultant",
    sources,
    rulings,
    experts,
    client: mockLlmClient,
  });
}

describe("context dials", () => {
  it("BE Flex is verify-first because 18 and 16 conflict, while the calendar is only stale", async () => {
    const result = await ask({ ...base, plan: "Flex" });
    expect(result.verdict).toBe("VERIFY_FIRST");
    expect(result.answer).not.toMatch(/\b16th\b|\b18th\b|\b20th\b/);
    const conflict = result.objections.find((objection) => objection.type === "CONFLICT");
    expect(conflict?.sourceIds.sort()).toEqual(["be-procedure-v4", "teams-karim-flex"]);
    expect(conflict?.resolvableBy).toBe("sofie-peeters");
    expect(result.objections.some((objection) => objection.type === "STALE" && objection.sourceIds.includes("be-calendar-2024"))).toBe(true);
    expect(result.objections.some((objection) => objection.type === "UNOWNED" && objection.sourceIds.includes("be-calendar-2024"))).toBe(true);
    expect(result.objections.some((objection) => objection.type === "UNOFFICIAL")).toBe(true);
    expect(result.objections.every((objection) => objection.resolvableBy !== "karim-el-amrani")).toBe(true);
  });

  it("BE Standard acts with care on the 18th", async () => {
    const result = await ask(base);
    expect(result.verdict).toBe("ACT_WITH_CARE");
    expect(result.answer).toContain("18th");
    expect(result.answer).not.toContain("16th");
    expect(result.objections.some((objection) => objection.type === "CONFLICT")).toBe(false);
    expect(result.objections.some((objection) => objection.type === "SCOPE" && objection.message.includes("Karim"))).toBe(true);
    expect(result.objections.some((objection) => objection.type === "STALE")).toBe(true);
  });

  it("NL acts on the 15th", async () => {
    const result = await ask({ country: "NL", plan: "Standard", asOf: "2026-09-30" });
    expect(result.verdict).toBe("ACT");
    expect(result.answer).toContain("15th");
  });

  it("NL is act-with-care once the procedure is past its review date", async () => {
    const nl = sources.find((source) => source.id === "nl-procedure-v7");
    expect(nl && isStale(nl, "2027-03-15")).toBe(true);
    const result = await ask({ country: "NL", plan: "Standard", asOf: "2027-03-15" });
    expect(result.verdict).toBe("ACT_WITH_CARE");
    expect(result.answer).toContain("15th");
    expect(result.objections.some((objection) => objection.type === "STALE")).toBe(true);
  });

  it("DE refuses to guess", async () => {
    const result = await ask({ country: "DE", plan: "Standard", asOf: "2026-09-30" });
    expect(result.verdict).toBe("VERIFY_FIRST");
    expect(result.answer).toBe("");
    expect(result.objections.some((objection) => objection.type === "GAP" && objection.severity === "warn")).toBe(true);
  });

  it("a signed Flex ruling supersedes the conflict and the stale calendar", async () => {
    const sofie = experts.find((expert) => expert.id === "sofie-peeters");
    expect(sofie).toBeDefined();
    const draft = draftRulingFromTranscript({
      transcript: SOFIE_RULING_LINE,
      expert: sofie!,
      context: { ...base, plan: "Flex" },
      sourceIds: ["be-procedure-v4", "teams-karim-flex", "be-calendar-2024"],
    });
    expect(draft?.value).toBe(16);
    expect(draft?.givenBy).toBe("sofie-peeters");
    const unsigned = {
      ...draft!,
      id: "ruling-sofie-flex",
      question: DEMO_QUESTION,
      context: { ...base, plan: "Flex" } as const,
      signedAt: "2026-09-30T12:00:00.000Z",
    };
    const ruling: Ruling = { ...unsigned, signature: signRuling(unsigned) };
    const result = await ask({ ...base, plan: "Flex" }, [ruling]);
    expect(result.verdict).toBe("ACT");
    expect(result.answer).toContain("16th");
    expect(result.objections.some((objection) => objection.type === "CONFLICT" || objection.type === "STALE")).toBe(false);
    expect(result.superseded.map((note) => note.sourceId)).toEqual(
      expect.arrayContaining(["be-procedure-v4", "teams-karim-flex", "be-calendar-2024"]),
    );
  });

  it("routes the witness to Sofie or Daan, never to Karim", () => {
    expect(resolverFor(experts, base)).toBe("sofie-peeters");
    expect(resolverFor(experts, { country: "NL", plan: "Standard", asOf: "2026-09-30" })).toBe("daan-de-vries");
    expect(resolverFor(experts, { country: "DE", plan: "Standard", asOf: "2026-09-30" })).toBeUndefined();
    expect(draftRulingFromTranscript({
      transcript: SOFIE_RULING_LINE,
      expert: experts.find((expert) => expert.id === "karim-el-amrani")!,
      context: { ...base, plan: "Flex" },
      sourceIds: [],
    })).toBeNull();
  });
});
