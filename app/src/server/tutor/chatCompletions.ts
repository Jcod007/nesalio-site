/**
 * Appel en flux à une API « Chat Completions » compatible OpenAI
 * (Vercel AI Gateway ou OpenRouter). Produit le texte du modèle morceau par
 * morceau, au fil de la génération.
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

export const streamChatCompletion: CompletionStream = async function* (options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.endpoint, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...options.extraHeaders,
    },
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      temperature: 0.4,
      max_tokens: options.maxTokens ?? 3000,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new UpstreamError(`Le modèle a répondu ${response.status} ${detail.slice(0, 300)}`, response.status);
  }

  yield* parseSse(response.body);
};

/** Lit un flux SSE (format OpenAI) et en extrait le texte généré. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const lines = done ? splitter.flush() : splitter.push(decoder.decode(value, { stream: true }));
      for (const line of lines) {
        if (!line.startsWith("data:")) continue; // commentaires de maintien de connexion
        const data = line.slice(5).trim();
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
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
