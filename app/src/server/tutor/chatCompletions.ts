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
    readonly code?: "token_limit",
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
  /**
   * Effort de réflexion avant de répondre. Plus il est bas, plus la première
   * phrase arrive vite : c'est le principal levier de latence.
   */
  reasoningEffort?: ReasoningEffort;
  /** Remplaçable dans les tests. */
  fetchImpl?: typeof fetch;
}

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ["none", "minimal", "low", "medium", "high"];

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
      // La réflexion du modèle compte dans cette limite : à 6000, un tour « continue » (longue consigne,
      // fiche de diagnostic) s'arrêtait en plein milieu, sans question, ou sans aucune étape.
      max_tokens: options.maxTokens ?? 16000,
      // Extension d'AI Gateway, traduite vers le réglage propre à chaque modèle.
      ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort } } : {}),
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
      // Explication en direct : effort modéré par défaut, pour garder la voix réactive.
      output_config: { effort: anthropicEffort(options.reasoningEffort) },
    }),
  });
  await ensureOk(response);
  yield* parseAnthropicSse(response.body!);
}

function anthropicEffort(effort: ReasoningEffort | undefined): "low" | "medium" | "high" {
  if (effort === "high") return "high";
  if (effort === "medium" || effort === undefined) return "medium";
  return "low";
}

async function ensureOk(response: Response) {
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new UpstreamError(`Le modèle a répondu ${response.status} ${detail.slice(0, 300)}`, response.status);
  }
}

/** Flux SSE de l'API Messages : on garde le texte (text_delta), on ignore la réflexion. */
export async function* parseAnthropicSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let completed = false;
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
    if (event.type === "message_stop") { completed = true; break; }
  }
  if (!completed) throw new UpstreamError("Flux Anthropic interrompu avant la fin du message");
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
  let completed = false;
  for await (const data of sseData(body)) {
    if (data === "[DONE]") { completed = true; break; }
    let payload: { choices?: { delta?: { content?: string }; finish_reason?: string | null }[]; error?: { message?: string } };
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    if (payload.error) throw new UpstreamError(payload.error.message ?? "Erreur du modèle");
    const text = payload.choices?.[0]?.delta?.content;
    if (text) yield text;
    // Réponse coupée par la limite de jetons : à surveiller dans les journaux (le tour finit incomplet).
    if (payload.choices?.[0]?.finish_reason === "length") throw new UpstreamError("Réponse coupée : limite de jetons atteinte", undefined, "token_limit");
  }
  if (!completed) throw new UpstreamError("Flux OpenAI interrompu avant le marqueur de fin");
}
