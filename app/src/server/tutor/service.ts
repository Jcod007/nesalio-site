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
import type { TutorRequest } from "@/domain/tutor/request";
import type { ChatProvider } from "@/server/config";
import { UpstreamError, type CompletionStream } from "./chatCompletions";
import { buildMessages } from "./prompt";
import type { ChatMessage } from "./prompt";
import { checkViolation, completionViolation, constructionViolation, decideTeaching } from "@/domain/tutor/controller";

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
  let terminalError = false;
  try {
    for await (const event of modelEvents(request, config)) {
      if (event.kind === "step") steps++;
      if (event.kind === "error") terminalError = true;
      yield event;
    }
    // Tour vide (le modèle n'a rien écrit d'utilisable) : une seconde chance avant d'afficher une erreur.
    if (steps === 0 && !terminalError && !config.signal?.aborted) {
      config.log?.("tutor: tour vide, nouvel essai");
      for await (const event of modelEvents(request, config)) {
        if (event.kind === "step") steps++;
        if (event.kind === "error") terminalError = true;
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

  if (steps === 0 && !terminalError) {
    yield { kind: "error", code: "empty", message: "Nesa n'a pas réussi à construire une explication. Reformule ta question ?" };
  }
}

/**
 * Un tour de séance : les étapes du modèle, validées une à une, jusqu'à la
 * première question posée à l'élève. Là, le tour s'arrête (« await ») et
 * l'appel au modèle est coupé : la suite dépendra de la réponse de l'élève.
 */
async function* modelEvents(request: TutorRequest, config: TutorServiceConfig): AsyncGenerator<StreamEvent> {
  const decision = decideTeaching(request);
  const accepted: StreamEvent[] = [];
  const knownIds = new Set(request.context?.board.map((item) => item.id) ?? []);
  let headerSent = false;
  let steps = 0;
  let repair: ChatMessage[] = [];
  // Une seule réparation : pas de boucle d'appels au modèle en cas de refus persistant.
  for (let attempt = 0; attempt < 2; attempt++) {
    let violation: string | null = null;
    let completed = false;
    for await (const event of rawModelEvents(request, config, repair)) {
      if (config.signal?.aborted) return;
      if (event.kind === "lesson") {
        if (headerSent) continue;
        headerSent = true;
      }
      if (event.kind === "step") {
        violation = checkViolation(event, decision, request) ?? constructionViolation(event, knownIds);
        if (violation) break; // La phrase interrogative et son dessin ne sont jamais transmis.
        if (steps >= MAX_STEPS) {
          yield { kind: "error", code: "upstream", message: "L’explication est trop longue pour ce tour. Tu peux demander la suite." };
          return;
        }
        steps++;
        for (const action of event.do) {
          if (action.type === "clear") knownIds.clear();
          if ("id" in action && typeof action.id === "string") knownIds.add(action.id);
        }
      }
      if (event.kind === "end") {
        violation = completionViolation(accepted.filter((e) => e.kind === "step"), decision, request);
        if (violation) break;
      }
      accepted.push(event);
      if (event.kind === "end" || event.kind === "await" || event.kind === "error") completed = true;
      yield event;
    }
    if (!violation) {
      if (attempt > 0 && !completed) yield { kind: "error", code: "upstream", message: "Nesa n’a pas réussi à compléter cette explication. Tu peux réessayer." };
      return;
    }
    config.log?.("tutor: sortie refusée par le contrôleur", { action: decision.action, attempt });
    repair = [
      ...(accepted.length ? [{ role: "assistant" as const, content: accepted.map((e) => JSON.stringify(e)).join("\n") }] : []),
      { role: "user", content: `CORRECTION DU CONTRÔLEUR : ${violation}\nLes étapes précédentes ont déjà été envoyées. Continue sans les répéter ni les redessiner, sans nouvel en-tête. Il reste ${MAX_STEPS - steps} étapes au plus. Termine l'explication par end.` },
    ];
  }
  yield { kind: "error", code: "upstream", message: "Nesa n’a pas réussi à terminer cette explication. Tu peux réessayer." };
}

async function* rawModelEvents(request: TutorRequest, config: TutorServiceConfig, repair: ChatMessage[] = []): AsyncGenerator<StreamEvent> {
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
    // Un exemple travaillé peut nécessiter des calculs dès le premier tour.
    reasoningEffort: request.mode === "question" ? (provider.firstTurnEffort ?? provider.reasoningEffort) : provider.reasoningEffort,
    messages: [...buildMessages(request), ...repair],
    signal: upstream.signal,
  });

  let received = 0;
  let head = "";
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
  if (parser.issues.length > 0) config.log?.("tutor: lignes du modèle écartées", parser.issues);
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
