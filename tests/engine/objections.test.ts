import { describe, expect, it } from "vitest";
import { filterByAccess } from "@/lib/engine/access";
import { detectConflicts } from "@/lib/engine/conflicts";
import { claimFromText } from "@/lib/engine/cutoff";
import { ageInDays, freshnessObjections } from "@/lib/engine/freshness";
import { injectionScan } from "@/lib/engine/injection";
import { ownershipObjections } from "@/lib/engine/ownership";
import { scopeCheck } from "@/lib/engine/scope";
import { unofficialObjections } from "@/lib/engine/unofficial";
import { loadSources } from "@/lib/corpus";
import { sha256 } from "@/lib/hash";
import { makeSource } from "../helpers";

const CANARY = "FIN-CONFIDENTIAL-7741";

describe("objections", () => {
  it("raises SCOPE when country, plan, or validity do not match", () => {
    const sources = [
      makeSource({
        id: "nl",
        text: "Dutch customers use another procedure.",
        scope: { countries: ["NL"], plans: "*" },
        acl: ["consultant"],
      }),
      makeSource({
        id: "be",
        text: "Belgian procedure.",
        scope: { countries: ["BE"], plans: "*" },
        acl: ["consultant"],
      }),
    ];
    const result = scopeCheck(sources, { country: "BE", plan: "Standard", asOf: "2026-09-30" });
    expect(result.inScope.map((source) => source.id)).toEqual(["be"]);
    expect(result.objections[0]).toMatchObject({ type: "SCOPE", severity: "info", sourceIds: ["nl"] });
  });

  it("raises STALE when age exceeds the review cycle", () => {
    expect(ageInDays("2026-09-18", "2026-09-30")).toBe(12);
    const fresh = makeSource({ id: "fresh", text: "Current.", updatedAt: "2026-09-18", reviewCycleDays: 90 });
    const stale = makeSource({ id: "old", text: "Old.", updatedAt: "2024-07-30", reviewCycleDays: 365 });
    const objections = freshnessObjections([fresh, stale], "2026-09-30");
    expect(objections).toHaveLength(1);
    expect(objections[0]).toMatchObject({ type: "STALE", severity: "warn", sourceIds: ["old"] });
  });

  it("raises UNOWNED when a source has no owner", () => {
    const owned = makeSource({ id: "owned", text: "Owned.", owner: "Sofie Peeters" });
    const loose = makeSource({ id: "loose", text: "Nobody owns this." });
    expect(ownershipObjections([owned, loose])[0]).toMatchObject({ type: "UNOWNED", severity: "warn" });
  });

  it("raises CONFLICT only between fresh claims with different cut-off days", () => {
    const fresh = new Set(["procedure", "chat"]);
    const conflict = detectConflicts(
      [
        { sourceId: "procedure", field: "cutoff_day", value: "18", quote: "by the 18th" },
        { sourceId: "chat", field: "cutoff_day", value: "16", quote: "is the 16th" },
        { sourceId: "calendar", field: "cutoff_day", value: "20", quote: "the 20th" },
      ],
      fresh,
    );
    expect(conflict).toHaveLength(1);
    expect(conflict[0]?.severity).toBe("critical");
    expect(conflict[0]?.sourceIds).toEqual(["procedure", "chat"]);
    expect(conflict[0]?.message).toContain("by the 18th");
    expect(conflict[0]?.message).toContain("is the 16th");
    expect(conflict[0]?.message).not.toContain("calendar");

    const same = detectConflicts(
      [
        { sourceId: "a", field: "cutoff_day", value: "18", quote: "18th" },
        { sourceId: "b", field: "cutoff_day", value: "18", quote: "18th again" },
      ],
      new Set(["a", "b"]),
    );
    expect(same).toHaveLength(0);
  });

  it("raises UNOFFICIAL for chat sources", () => {
    const chat = makeSource({ id: "chat", kind: "chat", text: "A consultant wrote this." });
    const procedure = makeSource({ id: "proc", kind: "procedure", text: "Controlled.", owner: "Sofie Peeters" });
    expect(unofficialObjections([chat, procedure])[0]).toMatchObject({ type: "UNOFFICIAL", severity: "warn" });
  });

  it("raises INTEGRITY info and quarantines the poisoned wiki", () => {
    const wiki = loadSources().find((source) => source.id === "wiki-payroll-tips");
    expect(wiki).toBeDefined();
    const clean = makeSource({ id: "clean", text: "Belgian payroll changes.", owner: "Sofie Peeters" });
    const tampered = makeSource({ id: "tampered", text: "Changed.", contentHash: sha256("different") });
    const result = injectionScan([wiki!, clean, tampered]);
    expect(result.clean.map((source) => source.id)).toEqual(["clean"]);
    expect(result.objections.every((objection) => objection.type === "INTEGRITY" && objection.severity === "info")).toBe(true);
    const rendered = JSON.stringify(result.objections);
    expect(rendered).not.toContain("attacker@example.com");
    expect(rendered).not.toContain("Ignore all previous");
  });

  it("raises GAP info with a count and no restricted content", () => {
    const secret = loadSources().find((source) => source.id === "finance-late-fees");
    expect(secret).toBeDefined();
    const employee = filterByAccess([secret!, makeSource({ id: "open", text: "Open.", acl: ["consultant"] })], "consultant");
    expect(employee.restrictedCount).toBe(1);
    expect(employee.objection).toMatchObject({ type: "GAP", severity: "info", sourceIds: [] });
    expect(JSON.stringify(employee.objection)).not.toContain(CANARY);
    expect(filterByAccess([secret!], "finance").restrictedCount).toBe(0);
  });

  it("does not treat payslip or expense dates as cut-offs", () => {
    const sources = loadSources();
    const payslip = sources.find((source) => source.id === "payslip-delivery-be");
    const expenses = sources.find((source) => source.id === "expenses-policy");
    expect(claimFromText("payslip", payslip!.text)).toBeNull();
    expect(claimFromText("expenses", expenses!.text)).toBeNull();
    expect(claimFromText("be", sources.find((source) => source.id === "be-procedure-v4")!.text)?.value).toBe("18");
    expect(claimFromText("cal", sources.find((source) => source.id === "be-calendar-2024")!.text)?.value).toBe("20");
    expect(claimFromText("chat", sources.find((source) => source.id === "teams-karim-flex")!.text)?.value).toBe("16");
    expect(claimFromText("nl", sources.find((source) => source.id === "nl-procedure-v7")!.text)?.value).toBe("15");
  });
});
