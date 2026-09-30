/** HTTP ask: validation, the per-IP limit, the Belgian Standard verdict, and the signed persona cookie. */
import { describe, expect, it } from "vitest";
import { POST as ask } from "@/app/api/ask/route";
import { GET as getSession, POST as postSession } from "@/app/api/session/route";
import { PERSONA_COOKIE, readSession, signSession } from "@/lib/auth";
import { loadExperts, loadRulings, loadSources, rulingIsAuthentic, rulingToSource, signRuling } from "@/lib/corpus";
import { DEMO_AS_OF, DEMO_QUESTION } from "@/lib/demo";
import { sha256 } from "@/lib/hash";
import type { Ruling } from "@/lib/types";

const CANARY = "FIN-CONFIDENTIAL-7741";

function askRequest(body: unknown, ip = "203.0.113.10", cookie?: string): Request {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": ip });
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/ask", () => {
  it("validates input and rate limits per IP", async () => {
    const invalid = await ask(
      askRequest({ question: "too short", context: { country: "FR", plan: "Standard", asOf: DEMO_AS_OF } }, "203.0.113.20"),
    );
    expect(invalid.status).toBe(400);

    const malformed = await ask(askRequest("{", "203.0.113.21"));
    expect(malformed.status).toBe(400);

    const ip = "203.0.113.30";
    for (let n = 0; n < 20; n += 1) {
      const response = await ask(
        askRequest(
          { question: DEMO_QUESTION, context: { country: "BE", plan: "Standard", asOf: DEMO_AS_OF } },
          ip,
        ),
      );
      expect(response.status).toBe(200);
    }
    const limited = await ask(
      askRequest({ question: DEMO_QUESTION, context: { country: "BE", plan: "Standard", asOf: DEMO_AS_OF } }, ip),
    );
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("returns the Belgian Standard cross-examination without restricted or injected text", async () => {
    const response = await ask(
      askRequest(
        { question: DEMO_QUESTION, context: { country: "BE", plan: "Standard", asOf: DEMO_AS_OF } },
        "203.0.113.40",
      ),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      verdict: string;
      answer: string;
      extractor: string;
      custody: { restricted: number; quarantined: number; sha256: string };
    };
    expect(body.verdict).toBe("ACT_WITH_CARE");
    expect(body.answer).toContain("18th");
    const rendered = JSON.stringify(body);
    expect(rendered).not.toContain(CANARY);
    expect(rendered).not.toContain("attacker@example.com");
    expect(rendered).not.toContain("SYSTEM OVERRIDE");
    expect(body.custody.restricted).toBe(1);
    expect(body.custody.quarantined).toBe(1);
    expect(body.custody.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.extractor).toBe("mock");
  });
});

describe("persona cookie", () => {
  it("refuses to switch persona unless DEMO_MODE is true", async () => {
    const previous = process.env.DEMO_MODE;
    delete process.env.DEMO_MODE;
    try {
      const response = await postSession(
        new Request("http://localhost/api/session", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.49" },
          body: JSON.stringify({ persona: "finance" }),
        }),
      );
      expect(response.status).toBe(403);
    } finally {
      if (previous === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = previous;
    }
  });

  it("sets an httpOnly cookie and fails closed when the signature is wrong", async () => {
    process.env.DEMO_MODE = "true";
    const response = await postSession(
      new Request("http://localhost/api/session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
        body: JSON.stringify({ persona: "finance" }),
      }),
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.startsWith(`${PERSONA_COOKIE}=`)).toBe(true);
    const token = setCookie.split(";")[0]?.slice(PERSONA_COOKIE.length + 1);
    expect(readSession(token)).toBe("finance");

    const current = await getSession(
      new Request("http://localhost/api/session", {
        headers: { cookie: `${PERSONA_COOKIE}=${token}`, "x-forwarded-for": "203.0.113.51" },
      }),
    );
    expect(await current.json()).toEqual({ persona: "finance" });
    expect(readSession(`${token}tampered`)).toBe("consultant");
    expect(signSession("consultant").length).toBeGreaterThan(10);
  });
});

describe("corpus", () => {
  it("ships 12 synthetic sources with matching hashes and four experts", () => {
    const sources = loadSources();
    expect(sources).toHaveLength(12);
    expect(new Set(sources.map((source) => source.id)).size).toBe(12);
    for (const source of sources) expect(source.contentHash).toBe(sha256(source.text));
    const experts = loadExperts();
    expect(experts).toHaveLength(4);
    const ids = new Set(sources.map((source) => source.id));
    for (const expert of experts) {
      for (const owned of expert.ownsSources) expect(ids.has(owned)).toBe(true);
    }
    expect(experts.find((expert) => expert.id === "karim-el-amrani")?.canSignRulings).toBe(false);
    expect(experts.find((expert) => expert.id === "sofie-peeters")?.canSignRulings).toBe(true);
    expect(loadRulings()).toEqual([]);
  });

  it("rejects a ruling whose signature does not match", () => {
    const unsigned: Omit<Ruling, "signature"> = {
      id: "ruling-1",
      question: DEMO_QUESTION,
      context: { country: "BE", plan: "Flex", asOf: DEMO_AS_OF },
      field: "cutoff_day",
      value: 16,
      quote: "Signed ruling. The payroll-change cut-off is the 16.",
      givenBy: "sofie-peeters",
      transcriptHash: sha256("transcript"),
      validFrom: "2026-09-01",
      supersedes: ["be-procedure-v4", "teams-karim-flex", "be-calendar-2024"],
      signedAt: "2026-09-30T12:00:00.000Z",
      scope: { countries: ["BE"], plans: ["Flex"] },
    };
    const ruling: Ruling = { ...unsigned, signature: signRuling(unsigned) };
    expect(rulingIsAuthentic(ruling)).toBe(true);
    expect(rulingIsAuthentic({ ...ruling, signature: "0".repeat(64) })).toBe(false);
    expect(rulingToSource(ruling).kind).toBe("ruling");
    expect(rulingToSource(ruling).text).toBe(ruling.quote);
  });
});
