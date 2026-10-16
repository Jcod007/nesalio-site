/**
 * Le service du tuteur : transforme une requête de l'élève en flux
 * d'événements validés, prêts à être joués par le navigateur.
 *
 * Il ne connaît ni HTTP ni OpenRouter directement : la source de texte est
 * injectée, ce qui permet de le tester avec une réponse enregistrée.
 */
import { matchDemoLesson, DEMO_LESSONS } from "@/content/demoLessons";
import type { Lesson, StreamEvent } from "@/domain/scene/schema";
import { createModelOutputParser, JsonObjectScanner } from "@/domain/tutor/modelOutput";
import type { TutorRequest } from "@/domain/tutor/request";
import type { ChatProvider } from "@/server/config";
import { UpstreamError, type CompletionStream } from "./chatCompletions";
import { buildMessages } from "./prompt";

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
  try {
    for await (const event of modelEvents(request, config)) {
      if (event.kind === "step") steps++;
      yield event;
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
    // La séance a commencé : on la termine proprement plutôt que d'afficher une erreur.
    yield { kind: "end", summary: [] };
    return;
  }

  if (steps === 0) {
    yield { kind: "error", code: "empty", message: "Nesa n'a pas réussi à construire une explication. Reformule ta question ?" };
  }
}

async function* modelEvents(request: TutorRequest, config: TutorServiceConfig): AsyncGenerator<StreamEvent> {
  const parser = createModelOutputParser();
  const scanner = new JsonObjectScanner();
  let steps = 0;
  let ended = false;
  let headerSent = false;

  const provider = config.provider!;
  const text = config.completion({
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: provider.model,
    extraHeaders: provider.extraHeaders,
    messages: buildMessages(request),
    signal: config.signal,
  });

  for await (const chunk of text) {
    for (const objectText of scanner.push(chunk)) {
      const event = parser.parseLine(objectText);
      if (!event || ended) continue;
      if (event.kind === "lesson") {
        if (headerSent || request.mode === "followUp") continue;
        headerSent = true;
        yield event;
      } else if (event.kind === "step") {
        if (steps >= MAX_STEPS) continue;
        if (!headerSent && request.mode === "question") {
          headerSent = true;
          yield { kind: "lesson", title: request.question.slice(0, 80) };
        }
        steps++;
        yield event;
      } else {
        ended = true;
        yield event;
      }
    }
  }
  if (parser.issues.length > 0) config.log?.("tutor: lignes du modèle écartées", parser.issues);
  if (!ended && steps > 0) yield { kind: "end", summary: [] };
}

function* lessonEvents(lesson: Lesson): Generator<StreamEvent> {
  yield lesson.header;
  for (const step of lesson.steps) yield { kind: "step", ...step };
  yield lesson.end;
}

/** Mode démonstration : la séance qui correspond le mieux, ou une séance d'exemple annoncée comme telle. */
export function* demoEvents(request: TutorRequest): Generator<StreamEvent> {
  if (request.mode === "followUp") {
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
