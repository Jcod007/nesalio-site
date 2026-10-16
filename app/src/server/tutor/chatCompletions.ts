/**
 * Appel en flux au modèle. Deux protocoles :
 * - « openai » : API Chat Completions (Vercel AI Gateway, OpenRouter) ;
 * - « anthropic » : API Messages de Claude, appelée directement.
 * Dans les deux cas, on produit le texte du modèle morceau par morceau.
 */
import { LineSplitter } from "@/domain/tutor/ndjson";
import type { ChatMessage } from "./prompt";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface CompletionOptions {
  protocol?: "openai" | "anthropic";
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  extraHeaders?: Record<string, string>;
  maxTokens?: number;
  /** Remplaçable dans les tests. */
  fetchImpl?: typeof fetch;
}

/** Une source de texte en flux : c'est tout ce dont le reste du serveur a besoin. */
export type CompletionStream = (options: CompletionOptions) => AsyncIterable<string>;

export const streamChatCompletion: CompletionStream = (options) =>
  options.protocol === "anthropic" ? streamAnthropic(options) : streamOpenAi(options);

async function* streamOpenAi(options: CompletionOptions): AsyncGenerator<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...options.extraHeaders,
    },
    // Pas de « temperature » : les modèles Claude récents refusent les valeurs inférieures à 1.
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      max_tokens: options.maxTokens ?? 6000,
    }),
  });
  await ensureOk(response);
  yield* parseSse(response.body!);
}

/** API Messages de Claude : le système à part, réflexion modérée pour garder la voix réactive. */
async function* streamAnthropic(options: CompletionOptions): AsyncGenerator<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const system = options.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = options.messages.filter((m) => m.role !== "system").map(({ role, content }) => ({ role, content }));
  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    signal: options.signal,
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...options.extraHeaders,
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: options.maxTokens ?? 8000,
      system,
      messages,
      stream: true,
      // Explication en direct : effort moyen, bon compromis entre justesse et rapidité.
      output_config: { effort: "medium" },
    }),
  });
  await ensureOk(response);
  yield* parseAnthropicSse(response.body!);
}

async function ensureOk(response: Response) {
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new UpstreamError(`Le modèle a répondu ${response.status} ${detail.slice(0, 300)}`, response.status);
  }
}

/** Flux SSE de l'API Messages : on garde le texte (text_delta), on ignore la réflexion. */
export async function* parseAnthropicSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const data of sseData(body)) {
    let event: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string; type?: string } };
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    if (event.type === "error") {
      const status = event.error?.type === "overloaded_error" ? 529 : undefined;
      throw new UpstreamError(event.error?.message ?? "Erreur du modèle", status);
    }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) yield event.delta.text;
    if (event.type === "message_stop") return;
  }
}

/** Les charges utiles « data: » d'un flux SSE. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const lines = done ? splitter.flush() : splitter.push(decoder.decode(value, { stream: true }));
      for (const line of lines) if (line.startsWith("data:")) yield line.slice(5).trim();
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Lit un flux SSE (format OpenAI) et en extrait le texte généré. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const data of sseData(body)) {
    if (data === "[DONE]") return;
    let payload: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    if (payload.error) throw new UpstreamError(payload.error.message ?? "Erreur du modèle");
    const text = payload.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}
