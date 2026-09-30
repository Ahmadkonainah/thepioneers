import type { LlmClient } from "@/lib/llm/client";
import { mockLlmClient } from "@/lib/llm/mock";

export class LlmError extends Error {
  constructor(
    public readonly code: "LLM_UNAVAILABLE" | "LLM_INVALID_OUTPUT",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** Hosted calls send only the system string and the user string. Sources are not a separate field. */
export function openAiRequestBody(system: string, user: string, model: string) {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  return {
    model,
    temperature: 0,
    response_format: { type: "json_object" as const },
    messages,
  };
}

function parseModelJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM response was not JSON.");
  }
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new LlmError("LLM_UNAVAILABLE", "LLM request failed.");
  }
  if (!response.ok) {
    throw new LlmError("LLM_UNAVAILABLE", `LLM HTTP ${response.status}.`);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new LlmError("LLM_INVALID_OUTPUT", "LLM response was not JSON.");
  }
}

function openAiClient(): LlmClient {
  return {
    async complete({ system, user }) {
      const key = process.env.LLM_API_KEY;
      if (!key) throw new LlmError("LLM_UNAVAILABLE", "LLM_API_KEY is not set.");
      const model = process.env.LLM_MODEL || "gpt-4o-mini";
      const base = (process.env.LLM_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
      const payload = await postJson(
        `${base}/v1/chat/completions`,
        {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        openAiRequestBody(system, user, model),
      );
      const content = readPath(payload, ["choices", "0", "message", "content"]);
      if (typeof content !== "string") {
        throw new LlmError("LLM_INVALID_OUTPUT", "LLM response missing content.");
      }
      return parseModelJson(content);
    },
  };
}

function anthropicClient(): LlmClient {
  return {
    async complete({ system, user }) {
      const key = process.env.LLM_API_KEY;
      if (!key) throw new LlmError("LLM_UNAVAILABLE", "LLM_API_KEY is not set.");
      const model = process.env.LLM_MODEL || "claude-3-5-haiku-latest";
      const payload = await postJson(
        "https://api.anthropic.com/v1/messages",
        {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        {
          model,
          max_tokens: 1500,
          temperature: 0,
          system,
          messages: [{ role: "user", content: user }],
        },
      );
      const content = readPath(payload, ["content", "0", "text"]);
      if (typeof content !== "string") {
        throw new LlmError("LLM_INVALID_OUTPUT", "LLM response missing content.");
      }
      return parseModelJson(content);
    },
  };
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function getLlmClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? "mock";
  if (provider === "mock") return mockLlmClient;
  if (provider === "openai") return openAiClient();
  if (provider === "anthropic") return anthropicClient();
  throw new LlmError("LLM_UNAVAILABLE", `Unknown LLM_PROVIDER "${provider}".`);
}
