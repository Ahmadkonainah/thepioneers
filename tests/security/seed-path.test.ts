/** The corpus reader accepts three literal seed names and rejects anything that could leave data/. */
import { describe, expect, it } from "vitest";
import { assertSeedName, loadSources } from "@/lib/corpus";

describe("seed files", () => {
  it("loads the shipped sources", () => {
    expect(loadSources().length).toBe(12);
  });

  it("rejects path traversal and unknown names", () => {
    expect(() => assertSeedName("../package.json")).toThrow(/seed directory/);
    expect(() => assertSeedName("sources.json/../../package.json")).toThrow(/seed directory/);
    expect(() => assertSeedName("rulings.json.tmp")).toThrow(/seed directory/);
    expect(assertSeedName("rulings.json")).toBe("rulings.json");
  });
});
