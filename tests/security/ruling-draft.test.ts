/** One filled answer can draft a ruling. An empty string is still rejected by the server. */
import { describe, expect, it } from "vitest";
import { POST as draft } from "@/app/api/rulings/route";
import { SOFIE_RULING_LINE } from "@/lib/demo";
import { DEPOSITION_COOKIE, createWitnessLink, openWitnessLink } from "@/lib/witness";

const context = { country: "BE" as const, plan: "Flex" as const, asOf: "2026-09-30" };

function sessionId(): string {
  const link = createWitnessLink({
    objectionIds: ["be-procedure-v4", "teams-karim-flex", "be-calendar-2024"],
    expertId: "sofie-peeters",
    context,
    question: "What is the cut-off date for submitting payroll changes for the monthly run?",
    questions: ["Which cut-off day applies?"],
  });
  const opened = openWitnessLink(link.token);
  if (typeof opened !== "object") throw new Error("The deposition link did not open.");
  return opened.sessionId;
}

function request(body: unknown, cookie: string, ip: string): Request {
  return new Request("http://localhost/api/rulings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      cookie: `${DEPOSITION_COOKIE}=${cookie}`,
    },
    body: JSON.stringify(body),
  });
}

describe("draft ruling", () => {
  it("returns a draft from a single answer", async () => {
    const response = await draft(request({ answers: [SOFIE_RULING_LINE] }, sessionId(), "203.0.113.81"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { draft?: { value: number; givenBy: string } };
    expect(body.draft?.value).toBe(16);
    expect(body.draft?.givenBy).toBe("sofie-peeters");
  });

  it("rejects an empty-string answer", async () => {
    const response = await draft(request({ answers: [""] }, sessionId(), "203.0.113.82"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
  });
});
