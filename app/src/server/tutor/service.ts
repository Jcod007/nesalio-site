/**
 * Le service du tuteur : transforme une requête de l'élève en flux
 * d'événements validés, prêts à être joués par le navigateur.
 *
 * Il ne connaît ni HTTP ni OpenRouter directement : la source de texte est
 * injectée, ce qui permet de le tester avec une réponse enregistrée.
 */
import { matchDemoLesson, DEMO_LESSONS } from "@/content/demoLessons";
import type { Lesson, StreamEvent } from "@/domain/scene/schema";
import { extractCues, inferCues } from "@/domain/tutor/cues";
import { createModelOutputParser, JsonObjectScanner } from "@/domain/tutor/modelOutput";
import { validateStep } from "@/domain/tutor/qualityGate";
import type { TutorRequest } from "@/domain/tutor/request";
import type { ChatProvider } from "@/server/config";
import { UpstreamError, type CompletionStream } from "./chatCompletions";
import { buildMessages } from "./prompt";

/** Étapes au plus par tour (un tour se termine normalement bien avant, sur une question). */
export const MAX_STEPS = 12;

export interface TutorServiceConfig {
  /** Sans fournisseur, on joue les séances de démonstration. */
  provider: ChatProvider | null;
  completion: CompletionStream;
  signal?: AbortSignal;
  log?: (message: string, detail?: unknown) => void;
}

export async function* tutorEvents(request: TutorRequest, config: TutorServiceConfig): AsyncGenerator<StreamEvent> {
  if (!config.provider) {
    yield { kind: "source", source: "demo" };
    yield* demoEvents(request);
    return;
  }

  yield { kind: "source", source: "model" };
  let steps = 0;
  const rejected: string[] = [];
  let endedNormally = false;
  try {
    for await (const event of modelEvents(request, config, rejected)) {
      if (event.kind === "step") steps++;
      if (event.kind === "await" || event.kind === "end") endedNormally = true;
      yield event;
    }
    // Tour vide (le modèle n'a rien écrit d'utilisable) : une seconde chance avant d'afficher une erreur.
    if (steps === 0 && !config.signal?.aborted) {
      config.log?.("tutor: tour vide, nouvel essai avec corrections", rejected.slice(0, 4));
      const feedback = rejected.slice(0, 3).map((reason) => reason.slice(0, 180));
      for await (const event of modelEvents(request, config, undefined, feedback)) {
        if (event.kind === "step") steps++;
        if (event.kind === "await" || event.kind === "end") endedNormally = true;
        yield event;
      }
    }
  } catch (error) {
    config.log?.("tutor: échec de l'appel au modèle", error);
    if (config.signal?.aborted) return;
    if (steps === 0 && isUnavailable(error)) {
      // Service d'IA non activé (paiement, droits) : la démonstration plutôt qu'une erreur.
      yield { kind: "source", source: "demo" };
      yield* demoEvents(request);
      return;
    }
    if (steps === 0) {
      yield { kind: "error", code: "upstream", message: "Nesa n'arrive pas à répondre pour le moment. Réessaie dans un instant." };
      return;
    }
    // Ne jamais présenter une génération interrompue comme une séance terminée.
    yield { kind: "error", code: "upstream", message: "L’explication a été interrompue. Tu peux réessayer." };
    return;
  }

  if (steps === 0) {
    yield { kind: "error", code: "empty", message: "Nesa n'a pas réussi à construire une explication. Reformule ta question ?" };
  } else if (!endedNormally && rejected.length > 0) {
    yield { kind: "error", code: "empty", message: "Une partie de l'explication n'a pas pu être validée. Tu peux demander de reprendre à partir du dernier dessin." };
  }
}

/**
 * Un tour de séance : les étapes du modèle, validées une à une, jusqu'à la
 * première question posée à l'élève. Là, le tour s'arrête (« await ») et
 * l'appel au modèle est coupé : la suite dépendra de la réponse de l'élève.
 */
async function* modelEvents(request: TutorRequest, config: TutorServiceConfig, rejected?: string[], feedback: readonly string[] = []): AsyncGenerator<StreamEvent> {
  const parser = createModelOutputParser();
  const scanner = new JsonObjectScanner();
  let steps = 0;
  let ended = false;
  let headerSent = false;
  const wantsHeader = request.mode === "question";

  // Coupe l'appel au modèle dès que le tour est fini (on ne paie pas pour la suite).
  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  config.signal?.addEventListener("abort", onAbort, { once: true });

  const provider = config.provider!;
  const text = config.completion({
    protocol: provider.protocol,
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: provider.model,
    extraHeaders: provider.extraHeaders,
    // Premier tour : réponse immédiate (pas de calcul) ; ensuite, un peu de réflexion pour la justesse.
    reasoningEffort: request.mode === "question" ? (provider.firstTurnEffort ?? provider.reasoningEffort) : provider.reasoningEffort,
    messages: [
      ...buildMessages(request),
      ...(feedback.length ? [{ role: "user" as const, content: `La tentative précédente a été refusée. Recommence correctement la même explication. Erreurs à corriger : ${feedback.join("; ")}` }] : []),
    ],
    signal: upstream.signal,
  });

  let received = 0;
  let head = "";
  let quality = { ids: new Set(request.context?.board.map((item) => item.id) ?? []) };
  let qualityRejected = 0;
  /** Les événements tirés d'objets JSON complets ; met `ended` à vrai quand le tour est fini. */
  function* handle(objects: string[]): Generator<StreamEvent> {
    for (const objectText of objects) {
      const event = parser.parseLine(objectText);
      if (!event || ended) continue;
      if (event.kind === "lesson") {
        if (headerSent || !wantsHeader) continue;
        headerSent = true;
        yield event;
      } else if (event.kind === "step") {
        if (steps >= MAX_STEPS) continue;
        const checked = validateStep(event, quality);
        if (!checked.ok) {
          qualityRejected++;
          if (checked.reason) rejected?.push(checked.reason);
          config.log?.("tutor: étape refusée avant diffusion", checked.reason);
          continue;
        }
        quality = checked.next;
        if (!headerSent && wantsHeader) {
          headerSent = true;
          yield { kind: "lesson", title: request.question.slice(0, 80) };
        }
        steps++;
        yield event;
        if (event.check) {
          // Question posée : le tour est fini, Nesa attend la réponse (avec ce qui a été refusé dans le tour).
          ended = true;
          const rejected = parser.issues.slice(0, 6).map((issue) => `${issue.reason} : ${issue.line}`.slice(0, 200));
          yield rejected.length > 0 ? { kind: "await", rejected } : { kind: "await" };
        }
      } else if (event.kind === "diagnosis") {
        // Fiche de diagnostic : transmise (gardée par le navigateur et l'enregistrement), sans finir le tour.
        yield event;
      } else {
        ended = true;
        yield event;
      }
      if (ended) break;
    }
  }
  try {
    for await (const chunk of text) {
      received += chunk.length;
      if (head.length < 300) head += chunk.slice(0, 300 - head.length);
      yield* handle(scanner.push(chunk));
      if (ended) break;
    }
    // Réponse coupée ou objet resté ouvert : ce qui reste, refermé.
    if (!ended) yield* handle(scanner.flush());
  } finally {
    config.signal?.removeEventListener("abort", onAbort);
    upstream.abort();
  }
  if (parser.issues.length > 0) {
    rejected?.push(...parser.issues.slice(0, 4).map((issue) => issue.reason));
    config.log?.("tutor: lignes du modèle écartées", parser.issues);
  }
  config.log?.("tutor: métriques de validation", {
    ...parser.metrics,
    rejectedByQualityGate: qualityRejected,
    deliveredSteps: steps,
  });
  // Tour vide : on garde de quoi comprendre pourquoi (rien reçu, ou texte sans étape valable).
  if (steps === 0) config.log?.(`tutor: aucune étape (${received} caractères reçus) : ${head.replace(/\s+/g, " ").slice(0, 300)}`);
  if (!ended && steps > 0) yield { kind: "end", summary: [] };
}

function* lessonEvents(lesson: Lesson): Generator<StreamEvent> {
  yield lesson.header;
  for (const step of lesson.steps) {
    // Les séances écrites à la main utilisent les mêmes repères {id} que le modèle.
    const { say, cues: explicit } = extractCues(step.say);
    const cues = inferCues(say, step.do as Parameters<typeof inferCues>[1], explicit);
    yield { kind: "step", ...step, say, cues: Object.keys(cues).length > 0 ? cues : undefined };
  }
  yield lesson.end;
}

/** Mode démonstration : la séance qui correspond le mieux, ou une séance d'exemple annoncée comme telle. */
export function* demoEvents(request: TutorRequest): Generator<StreamEvent> {
  if (request.mode !== "question") {
    yield {
      kind: "step",
      say: "Bonne question ! En mode démonstration, je ne peux pas encore répondre librement. Je reprends l'explication là où on était.",
      mood: "idee",
      do: [],
    };
    yield { kind: "end", summary: [] };
    return;
  }

  const matched = matchDemoLesson(request.question);
  const lesson = matched ?? DEMO_LESSONS[0];
  const [header, ...rest] = [...lessonEvents(lesson)];
  yield header!;
  if (!matched) {
    yield {
      kind: "step",
      say: `Je suis en mode démonstration pour l'instant. Je te montre comment je travaille avec une séance sur ${lesson.header.title.toLowerCase()}.`,
      mood: "idee",
      do: [],
    };
  }
  yield* rest;
}

/** Erreur d'accès (clé refusée, paiement requis) : le service n'est pas utilisable pour l'instant. */
export function isUnavailable(error: unknown): boolean {
  return error instanceof UpstreamError && [401, 402, 403].includes(error.status ?? 0);
}
