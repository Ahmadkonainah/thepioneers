/** Critical beats warn, warn beats a clean record, and no claim refuses to guess. */
import { describe, expect, it } from "vitest";
import { decideVerdict, verdict } from "@/lib/engine/verdict";
import type { Objection } from "@/lib/types";

function objection(severity: Objection["severity"], type: Objection["type"] = "GAP"): Objection {
  return { type, severity, sourceIds: [], message: severity, whatWouldResolve: "Resolve it." };
}

describe("verdict matrix", () => {
  it("maps the highest severity to a verdict", () => {
    expect(verdict([])).toBe("ACT");
    expect(verdict([objection("info", "SCOPE"), objection("info", "INTEGRITY")])).toBe("ACT");
    expect(verdict([objection("warn", "STALE")])).toBe("ACT_WITH_CARE");
    expect(verdict([objection("info", "GAP"), objection("warn", "UNOWNED")])).toBe("ACT_WITH_CARE");
    expect(verdict([objection("critical", "CONFLICT")])).toBe("VERIFY_FIRST");
    expect(verdict([objection("warn", "STALE"), objection("critical", "CONFLICT")])).toBe("VERIFY_FIRST");
  });

  it("refuses to guess when no claim is in scope", () => {
    expect(decideVerdict([objection("warn", "GAP")], true)).toBe("VERIFY_FIRST");
    expect(decideVerdict([objection("info", "SCOPE")], false)).toBe("ACT");
  });
});
