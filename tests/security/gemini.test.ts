/** The Gemini key is a header, is absent when unset, and is named only in the server module. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { geminiRequestBody, getLlmClient, LlmError } from "@/lib/llm";

const FAKE_KEY = "test-gemini-key";

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

describe("Gemini API key", () => {
  const previous = {
    provider: process.env.LLM_PROVIDER,
    key: process.env.GEMINI_API_KEY,
    model: process.env.LLM_MODEL,
  };

  afterEach(() => {
    process.env.LLM_PROVIDER = previous.provider;
    process.env.LLM_MODEL = previous.model;
    if (previous.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous.key;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fails closed when the key is missing and does not invent an answer", async () => {
    process.env.LLM_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      getLlmClient().complete({
        system: "system",
        user: "user",
        purpose: "extract",
        sources: [],
        claims: [],
      }),
    ).rejects.toMatchObject({ code: "LLM_UNAVAILABLE", message: "GEMINI_API_KEY is not set." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the key as a header, not in the URL, and does not ask Gemini to store the question", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = FAKE_KEY;
    process.env.LLM_MODEL = "gemini-3.8-flash";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ steps: [{ content: [{ text: '{"claims":[]}' }] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLlmClient().complete({
      system: "extract",
      user: "<question>cut-off</question>",
      purpose: "extract",
      sources: [],
      claims: [],
    });

    expect(result).toEqual({ claims: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const url = call[0];
    const init = call[1];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(url).not.toContain(FAKE_KEY);
    const headers = new Headers(init.headers);
    expect(headers.get("x-goog-api-key")).toBe(FAKE_KEY);
    const body = JSON.parse(String(init.body)) as ReturnType<typeof geminiRequestBody>;
    expect(body).toEqual(geminiRequestBody("extract", "<question>cut-off</question>", "gemini-3.8-flash"));
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
  });

  it("rejects a model reply that is not JSON", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = FAKE_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output_text: "the cut-off is the 25th" }), { status: 200 })),
    );
    await expect(
      getLlmClient().complete({
        system: "answer",
        user: "question",
        purpose: "answer",
        sources: [],
        claims: [],
      }),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it("is the only TypeScript module that names GEMINI_API_KEY", () => {
    const hits: string[] = [];
    for (const root of ["app", "components", "lib", "tests"]) {
      for (const file of walk(root)) {
        if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
        if (readFileSync(file, "utf8").includes("GEMINI_API_KEY")) hits.push(file.split(path.sep).join("/"));
      }
    }
    expect(hits.sort()).toEqual(["lib/llm.ts", "tests/security/gemini.test.ts"]);
  });
});
