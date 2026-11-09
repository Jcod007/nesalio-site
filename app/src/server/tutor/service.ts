/**
 * Le service du tuteur : transforme une requête de l'élève en flux
 * d'événements validés, prêts à être joués par le navigateur.
 *
 * Il ne connaît ni HTTP ni OpenRouter directement : la source de texte est
 * injectée, ce qui permet de le tester avec une réponse enregistrée.
 */
import { matchDemoLesson, DEMO_LESSONS } from "@/content/demoLessons";
import type { StepEventT, StreamEvent } from "@/domain/scene/schema";
import { stepActions } from "@/domain/scene/stepAccess";
import { createModelOutputParser, JsonObjectScanner } from "@/domain/tutor/modelOutput";
import type { TutorRequest } from "@/domain/tutor/request";
import type { ChatProvider } from "@/server/config";
import { UpstreamError, type CompletionStream } from "./chatCompletions";
import { buildMessages } from "./prompt";
import type { ChatMessage } from "./prompt";
import { checkViolation, completionViolation, constructionViolation, decideTeaching, type TeachingDecision } from "@/domain/tutor/controller";

/** Limite technique : une découverte peut inclure vocabulaire, construction et résolution complète. */
export const MAX_STEPS = 18;

export interface TutorServiceConfig {
  /** Sans fournisseur, on joue les séances de démonstration. */
  provider: ChatProvider | null;
  completion: CompletionStream;
  signal?: AbortSignal;
  log?: (message: string, detail?: unknown) => void;
  now?: () => number;
  onModelStep?: (step: StepEventT, raw: string) => void;
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
    const effort = request.mode === "question" ? config.provider.firstTurnEffort ?? config.provider.reasoningEffort : config.provider.reasoningEffort;
    if (steps === 0 && error instanceof UpstreamError && error.code === "token_limit" && effort && effort !== "none") {
      // Rien n'a été présenté : un seul nouvel essai sans réflexion cachée, avec le même contrôleur.
      // « none » empêche cette branche de se rappeler si le second essai échoue aussi.
      config.log?.("tutor: budget épuisé avant la première étape, nouvel essai sans réflexion");
      yield* tutorEvents(request, { ...config, provider: { ...config.provider, firstTurnEffort: "none", reasoningEffort: "none" } });
      return;
    }
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
  const now = (config.now ?? Date.now)();
  let decision = decideTeaching(request, now);
  const accepted: StreamEvent[] = [];
  const knownIds = new Set(request.context?.board.map((item) => item.id));
  let headerSent = false;
  let steps = 0;
  let repair: ChatMessage[] = [];
  // Une seule réparation : pas de boucle d'appels au modèle en cas de refus persistant.
  for (let attempt = 0; attempt < 2; attempt++) {
    let violation: string | null = null;
    let completed = false;
    for await (const event of rawModelEvents(request, config, repair, decision)) {
      if (config.signal?.aborted) return;
      if (event.kind === "invalid-step") { violation = event.reason; break; }
      if (event.kind === "lesson") {
        if (headerSent) continue;
        headerSent = true;
      }
      if (event.kind === "plan") {
        decision = decideTeaching({ ...request, context: { spoken: [], board: [], ...request.context, plan: event.plan } }, now);
      }
      if (event.kind === "step") {
        violation = checkViolation(event, decision, request, accepted.filter((acceptedEvent) => acceptedEvent.kind === "step")) ?? constructionViolation(event, knownIds);
        if (violation) break; // La phrase interrogative et son dessin ne sont jamais transmis.
        if (steps >= MAX_STEPS) {
          yield { kind: "error", code: "upstream", message: "L’explication est trop longue pour ce tour. Tu peux demander la suite." };
          return;
        }
        steps++;
        for (const action of stepActions(event)) {
          if (action.type === "clear") knownIds.clear();
          if (action.type === "erase") knownIds.delete(action.target);
          if ("id" in action && typeof action.id === "string") knownIds.add(action.id);
        }
      }
      if (event.kind === "end") {
        if (decision.target && accepted.some((e) => e.kind === "step" && !e.teaching))
          config.log?.("tutor: couverture pédagogique non vérifiable, annotations absentes");
        violation = completionViolation(accepted.filter((e) => e.kind === "step"), decision, request, event.reason);
        if (violation) break;
        // Une mise en garde générale n'est pas une difficulté observée chez cet élève.
        if (!request.answer && !request.context?.answers?.length) delete event.noticed;
      }
      accepted.push(event);
      if (event.kind === "end" || event.kind === "await" || event.kind === "error") completed = true;
      yield event;
    }
    if (!violation) {
      if (attempt > 0 && !completed) yield { kind: "error", code: "upstream", message: "Nesa n’a pas réussi à compléter cette explication. Tu peux réessayer." };
      return;
    }
    config.log?.("tutor: sortie refusée par le contrôleur", { action: decision.action, attempt, reason: violation.slice(0, 240) });
    repair = [
      ...(accepted.length ? [{ role: "assistant" as const, content: accepted.map((e) => JSON.stringify(e)).join("\n") }] : []),
      { role: "user", content: `CORRECTION DU CONTRÔLEUR : ${violation}\nLes étapes précédentes ont déjà été envoyées. Continue sans les répéter ni les redessiner, sans nouvel en-tête. Il reste ${MAX_STEPS - steps} étapes au plus. ${decision.requireCheck ? "Termine par une étape avec check, puis attends la réponse, sans end." : "Termine l'explication par end."}` },
    ];
  }
  yield { kind: "error", code: "upstream", message: "Nesa n’a pas réussi à terminer cette explication. Tu peux réessayer." };
}

async function* rawModelEvents(request: TutorRequest, config: TutorServiceConfig, repair: ChatMessage[], decision: TeachingDecision): AsyncGenerator<StreamEvent | { kind: "invalid-step"; reason: string }> {
  const parser = createModelOutputParser({ segmentedOnly: true });
  const originals: string[] = [];
  const scanner = new JsonObjectScanner(config.onModelStep ? (raw) => originals.push(raw) : undefined);
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
    messages: [...buildMessages(request, decision), ...repair],
    signal: upstream.signal,
  });

  let received = 0;
  let head = "";
  /** Les événements tirés d'objets JSON complets ; met `ended` à vrai quand le tour est fini. */
  function* handle(objects: string[]): Generator<StreamEvent | { kind: "invalid-step"; reason: string }> {
    for (const [index, objectText] of objects.entries()) {
      const event = parser.parseLine(objectText);
      if (!event || ended) {
        if (!event && parser.issues.at(-1)?.reason.startsWith("Étape segmentée invalide")) {
          ended = true;
          yield { kind: "invalid-step", reason: parser.issues.at(-1)!.reason };
        }
        continue;
      }
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
        if (config.onModelStep) config.onModelStep(event, originals[index]!);
        yield event;
        if (event.check) {
          // Question posée : le tour est fini, Nesa attend la réponse (avec ce qui a été refusé dans le tour).
          ended = true;
          const rejected = parser.issues.slice(0, 6).map((issue) => `${issue.reason} : ${issue.line}`.slice(0, 200));
          yield rejected.length > 0 ? { kind: "await", rejected } : { kind: "await" };
        }
      } else if (event.kind === "diagnosis" || event.kind === "plan") {
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
      originals.length = 0;
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

/** Mode démonstration : la séance qui correspond le mieux, ou une séance d'exemple annoncée comme telle. */
export function* demoEvents(request: TutorRequest): Generator<StreamEvent> {
  if (request.mode !== "question") {
    yield {
      kind: "step",
      mood: "idee",
      segments: [{ say: "Bonne question ! En mode démonstration, je ne peux pas encore répondre librement. Je reprends l'explication là où on était.", do: [] }],
    };
    yield { kind: "end", summary: [] };
    return;
  }

  const matched = matchDemoLesson(request.question);
  const lesson = matched ?? DEMO_LESSONS[0];
  yield lesson.header;
  if (!matched) {
    yield {
      kind: "step",
      mood: "idee",
      segments: [{ say: `Je suis en mode démonstration pour l'instant. Je te montre comment je travaille avec une séance sur ${lesson.header.title.toLowerCase()}.`, do: [] }],
    };
  }
  for (const step of lesson.steps) yield { kind: "step", ...step };
  yield lesson.end;
}

/** Erreur d'accès (clé refusée, paiement requis) : le service n'est pas utilisable pour l'instant. */
export function isUnavailable(error: unknown): boolean {
  return error instanceof UpstreamError && [401, 402, 403].includes(error.status ?? 0);
}
