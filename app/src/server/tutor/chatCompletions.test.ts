import { afterEach, describe, expect, it, vi } from "vitest";
import { streamChatCompletion, type CompletionOptions } from "./chatCompletions";

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";

function sse(...events: string[]): Response {
  return new Response(events.map((event) => `data: ${event}\n\n`).join(""), { status: 200 });
}

/** Runs one completion against a fake fetch and returns the JSON body that was sent. */
async function sentBody(options: Partial<CompletionOptions>): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return options.protocol === "anthropic"
      ? sse(JSON.stringify({ type: "message_stop" }))
      : sse(JSON.stringify({ choices: [{ delta: { content: "ok" } }] }), "[DONE]");
  }) as unknown as typeof fetch;
  for await (const chunk of streamChatCompletion({ endpoint: GATEWAY, apiKey: "k", model: "m", messages: [{ role: "user", content: "x" }], fetchImpl, ...options })) void chunk;
  return body;
}

afterEach(() => vi.unstubAllEnvs());

describe("vie privée sur AI Gateway", () => {
  it("demande la non-conservation et l'interdiction d'entraînement à chaque appel", async () => {
    vi.stubEnv("NESALIO_ZDR", "");
    expect((await sentBody({})).providerOptions).toEqual({ gateway: { zeroDataRetention: true, disallowPromptTraining: true } });
  });

  it("garde l'interdiction d'entraînement quand NESALIO_ZDR=0", async () => {
    vi.stubEnv("NESALIO_ZDR", "0");
    expect((await sentBody({})).providerOptions).toEqual({ gateway: { disallowPromptTraining: true } });
  });

  it("n'ajoute rien hors du Gateway (OpenRouter, Claude direct)", async () => {
    expect(await sentBody({ endpoint: "https://openrouter.ai/api/v1/chat/completions" })).not.toHaveProperty("providerOptions");
    expect(await sentBody({ protocol: "anthropic", endpoint: "https://api.anthropic.com/v1/messages" })).not.toHaveProperty("providerOptions");
  });

  it("conserve le reste du corps de la requête", async () => {
    const body = await sentBody({ reasoningEffort: "low", maxTokens: 300 });
    expect(body).toMatchObject({ model: "m", stream: true, max_tokens: 300, reasoning: { effort: "low" } });
  });
});
