/**
 * Appel en flux à l'API OpenRouter (format compatible OpenAI).
 * Produit le texte du modèle morceau par morceau, au fil de la génération.
 */
import { LineSplitter } from "@/domain/tutor/ndjson";
import type { ChatMessage } from "./prompt";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

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
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  appUrl?: string;
  maxTokens?: number;
  /** Remplaçable dans les tests. */
  fetchImpl?: typeof fetch;
}

/** Une source de texte en flux : c'est tout ce dont le reste du serveur a besoin. */
export type CompletionStream = (options: CompletionOptions) => AsyncIterable<string>;

export const streamOpenRouter: CompletionStream = async function* (options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.appUrl ? { "HTTP-Referer": options.appUrl } : {}),
      "X-Title": "Nesalio",
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
    throw new UpstreamError(`OpenRouter a répondu ${response.status} ${detail.slice(0, 200)}`, response.status);
  }

  yield* parseSse(response.body);
};

/** Lit un flux SSE d'OpenRouter et en extrait le texte généré. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const lines = done ? splitter.flush() : splitter.push(decoder.decode(value, { stream: true }));
      for (const line of lines) {
        if (!line.startsWith("data:")) continue; // commentaires « : OPENROUTER PROCESSING »
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
