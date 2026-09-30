import { describe, expect, it } from "vitest";
import { createWitnessLink, openWitnessLink, readWitnessToken, resetWitnessStore, resumeWitnessLink, sealWitnessSession } from "@/lib/witness";

const context = { country: "BE" as const, plan: "Flex" as const, asOf: "2026-09-30" };

describe("signed witness links", () => {
  it("rejects a tampered token, an expired token, and a sealed nonce", () => {
    resetWitnessStore();
    const link = createWitnessLink({
      objectionIds: ["be-procedure-v4"],
      expertId: "sofie-peeters",
      context,
      question: "What is the cut-off?",
      questions: ["Which day?"],
    });
    const opened = openWitnessLink(link.token);
    expect(typeof opened).toBe("object");
    expect(openWitnessLink(link.token)).toBe("reused");

    const flipped = `${link.token.slice(0, -1)}${link.token.endsWith("a") ? "b" : "a"}`;
    expect(readWitnessToken(flipped)).toBe("tampered");

    const expired = createWitnessLink({
      objectionIds: ["be-procedure-v4"],
      expertId: "sofie-peeters",
      context,
      question: "What is the cut-off?",
      questions: ["Which day?"],
      now: Date.now() - 16 * 60 * 1000,
    });
    expect(readWitnessToken(expired.token)).toBe("expired");

    if (typeof opened === "object") sealWitnessSession(opened.sessionId);
    expect(resumeWitnessLink(link.token)).toBe("reused");
  });
});
