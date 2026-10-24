/**
 * Le service du studio : une idée de vidéo devient un script validé, ou un
 * plan est refait selon la consigne de l'auteur.
 *
 * Comme pour le tuteur, la source de texte est injectée (testable avec une
 * réponse enregistrée), et le texte du modèle passe par le même validateur.
 */
import { STUDIO_DEMOS } from "@/content/studioDemos";
import { createStudioParser, type Shot, type StudioScript, type VideoFormat } from "@/domain/studio/script";
import { JsonObjectScanner } from "@/domain/tutor/modelOutput";
import type { ChatProvider } from "@/server/config";
import type { ChatMessage } from "@/server/tutor/prompt";
import { UpstreamError, type CompletionStream } from "@/server/tutor/chatCompletions";
import { buildRevisionMessages, buildStudioMessages, type RevisionRequest } from "./prompt";

export interface StudioServiceConfig {
  provider: ChatProvider | null;
  completion: CompletionStream;
  signal?: AbortSignal;
  log?: (message: string, detail?: unknown) => void;
}

export type GenerateResult =
  | { ok: true; source: "model" | "demo"; script: StudioScript; issues: string[] }
  | { ok: false; status: number; message: string };

async function collect(messages: ChatMessage[], config: StudioServiceConfig, fallbackTitle: string) {
  const provider = config.provider!;
  const parser = createStudioParser();
  const scanner = new JsonObjectScanner();
  const text = config.completion({
    protocol: provider.protocol,
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: provider.model,
    extraHeaders: provider.extraHeaders,
    // Pas de temps réel ici : un peu de réflexion pour la justesse des figures et des nombres.
    reasoningEffort: provider.reasoningEffort ?? "low",
    messages,
    signal: config.signal,
  });
  for await (const chunk of text) for (const object of scanner.push(chunk)) parser.push(object);
  for (const object of scanner.flush()) parser.push(object);
  if (parser.issues.length > 0) config.log?.("studio: lignes du modèle écartées", parser.issues);
  return { script: parser.result(fallbackTitle), issues: parser.issues.map((i) => `${i.reason} : ${i.line}`.slice(0, 200)) };
}

/** Message d'erreur du modèle, assez précis pour que l'auteur sache quoi changer (clé, modèle, crédit). */
export function upstreamMessage(error: unknown): string {
  const status = error instanceof UpstreamError ? error.status : undefined;
  if (status === 401 || status === 403) return "Clé API refusée : vérifie-la (et ses droits) chez le fournisseur.";
  if (status === 402) return "Crédit insuffisant sur le compte de cette clé API.";
  if (status === 400 || status === 404) return "Le fournisseur a refusé la demande : vérifie le nom du modèle.";
  if (status === 429) return "Le fournisseur limite les appels pour l'instant : réessaie dans une minute.";
  return "Le modèle ne répond pas pour le moment. Réessaie dans un instant.";
}

/** Sans service d'IA : l'exemple le plus proche de l'idée (mots en commun), annoncé comme tel. */
export function pickDemo(prompt: string): StudioScript {
  const fold = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const asked = new Set(fold(prompt).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  let best = STUDIO_DEMOS[0]!;
  let bestScore = 0;
  for (const demo of STUDIO_DEMOS) {
    const text = fold([demo.title, demo.hook, ...demo.shots.map((s) => s.text)].join(" "));
    const score = [...asked].filter((w) => text.includes(w)).length;
    if (score > bestScore) {
      best = demo;
      bestScore = score;
    }
  }
  return best;
}

export async function generateVideo(prompt: string, format: VideoFormat, config: StudioServiceConfig): Promise<GenerateResult> {
  if (!config.provider) return { ok: true, source: "demo", script: pickDemo(prompt), issues: [] };
  try {
    let result = await collect(buildStudioMessages(prompt, format), config, prompt.slice(0, 60));
    // Réponse sans plan utilisable : une seconde chance avant d'afficher une erreur.
    if (!result.script && !config.signal?.aborted) result = await collect(buildStudioMessages(prompt, format), config, prompt.slice(0, 60));
    if (!result.script) return { ok: false, status: 502, message: "Le modèle n'a pas écrit de plan utilisable. Reformule ton idée ?" };
    return { ok: true, source: "model", script: result.script, issues: result.issues };
  } catch (error) {
    config.log?.("studio: échec de l'appel au modèle", error instanceof UpstreamError ? `${error.status ?? ""}` : "erreur");
    return { ok: false, status: 502, message: upstreamMessage(error) };
  }
}

export type ReviseResult = { ok: true; shots: Shot[]; issues: string[] } | { ok: false; status: number; message: string };

export async function reviseShot(request: RevisionRequest, format: VideoFormat, config: StudioServiceConfig): Promise<ReviseResult> {
  if (!config.provider) return { ok: false, status: 503, message: "Aucun service d'IA configuré : modifie le plan à la main." };
  try {
    const { script, issues } = await collect(buildRevisionMessages(request, format), config, request.script.title);
    if (!script) return { ok: false, status: 502, message: "Le modèle n'a pas proposé de plan utilisable. Reformule ta consigne ?" };
    return { ok: true, shots: script.shots.slice(0, 2), issues };
  } catch (error) {
    config.log?.("studio: échec de la révision", error instanceof UpstreamError ? `${error.status ?? ""}` : "erreur");
    return { ok: false, status: 502, message: upstreamMessage(error) };
  }
}
