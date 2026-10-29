/**
 * Enregistrement des séances, pour améliorer Nesalio.
 *
 * Un fichier par TOUR (une requête à /api/tutor) : ce que l'élève a demandé
 * ou répondu, et exactement ce que Nesa lui a envoyé (paroles, dessins,
 * questions, lignes refusées). Les événements gardent le format du flux, donc
 * une séance se rejoue image par image (tools/rejeu).
 *
 * Pas de nom, de courriel, d'adresse IP ni d'audio. La session est un
 * identifiant tiré au hasard à l'ouverture de la page (domain/session.ts).
 * Si la personne s'est inscrite sur le site, la référence de son inscription
 * est notée : elle relie ses séances à son courriel, gardé dans Formspree.
 */
import type { SourceKind, StreamEvent } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";
import type { LearningState } from "@/domain/tutor/learning";
import type { TeachingPlan } from "@/domain/tutor/plan";
import { shortSession } from "@/domain/session";

export type RecordEnv = "production" | "preview" | "development";
export type TurnOutcome = "complete" | "cancelled" | "error";

export interface TurnRecord {
  v: 1;
  env: RecordEnv;
  /** Identifiant de session de la page (hasard), ou null si le navigateur ne l'a pas envoyé. */
  session: string | null;
  /** Référence de l'inscription sur le site (relie la séance au courriel, dans Formspree) ; absente sans inscription. */
  ref?: string;
  /** Début du tour (ISO 8601, UTC). */
  at: string;
  mode: TutorRequest["mode"];
  question: string;
  /** Réponse de l'élève à la question précédente de Nesa (tour « continue »). */
  answer?: { prompt: string; picked: string; correct: boolean | null; misconception?: string; concept?: string; support?: "guided" | "independent" };
  /** État déclaré par le lecteur avant ce tour ; absent des anciens enregistrements. */
  learning?: LearningState;
  /** Plan dynamique reçu avant le tour, pour pouvoir analyser les décisions. */
  plan?: TeachingPlan;
  /** Objectifs de la séance, tels que Nesa les a fixés au premier tour. */
  goals?: string[];
  source: SourceKind;
  model?: string;
  /** firstStep : délai avant la première étape (ce que l'élève attend avant que Nesa parle) ; total : tour complet. */
  latencyMs: { firstStep?: number; total: number };
  outcome: TurnOutcome;
  events: StreamEvent[];
}

export interface TurnRecorder {
  event(event: StreamEvent): void;
  finish(outcome: TurnOutcome): void;
  /** L'enregistrement tel qu'il est maintenant (un tour non terminé compte comme interrompu). */
  record(): TurnRecord;
}

export function createTurnRecorder(options: {
  request: TutorRequest;
  session: string | null;
  ref?: string | null;
  env: RecordEnv;
  source: SourceKind;
  model?: string;
  startedAt: Date;
  clock: { now(): number };
}): TurnRecorder {
  const { request, clock } = options;
  const started = clock.now();
  const events: StreamEvent[] = [];
  let source = options.source;
  let firstStep: number | undefined;
  let ended: number | undefined;
  let outcome: TurnOutcome | undefined;

  return {
    event(event) {
      if (outcome) return;
      // Le serveur envoie d'abord des événements techniques (« source ») : on mesure l'attente de la première étape.
      if (firstStep === undefined && event.kind === "step") firstStep = clock.now() - started;
      events.push(event);
      if (event.kind === "source") source = event.source;
    },
    finish(result) {
      if (outcome) return;
      outcome = result;
      ended = clock.now() - started;
    },
    record() {
      const answer = request.answer;
      return {
        v: 1,
        env: options.env,
        session: options.session,
        ...(options.ref ? { ref: options.ref } : {}),
        at: options.startedAt.toISOString(),
        mode: request.mode,
        question: request.question,
        ...(answer
          ? {
              answer: {
                prompt: answer.prompt,
                picked: answer.picked,
                correct: answer.correct,
                ...(answer.misconception ? { misconception: answer.misconception } : {}),
                ...(answer.concept ? { concept: answer.concept, support: answer.support } : {}),
              },
            }
          : {}),
        ...(request.context?.goals?.length ? { goals: [...request.context.goals] } : {}),
        ...(request.context?.learning ? { learning: structuredClone(request.context.learning) } : {}),
        ...(request.context?.plan ? { plan: structuredClone(request.context.plan) } : {}),
        source,
        ...(source === "model" && options.model ? { model: options.model } : {}),
        latencyMs: { ...(firstStep !== undefined ? { firstStep } : {}), total: ended ?? clock.now() - started },
        outcome: outcome ?? "cancelled",
        events: [...events],
      };
    },
  };
}

/**
 * Chemin du fichier : environnement / jour / session courte / heure-mode.
 * Les tours d'une séance se suivent dans le même dossier, dans l'ordre.
 */
export function turnPath(record: TurnRecord): string {
  const at = record.at; // 2026-10-18T14:12:05.123Z
  const day = at.slice(0, 10);
  const time = at.slice(11, 23).replace(/[:.]/g, "");
  const folder = record.session ? shortSession(record.session) : "sans-session";
  return `${record.env}/${day}/${folder}/${time}-${record.mode}.json`;
}

/** Une séance (une visite de la page), résumée pour la consultation. */
export interface SessionSummary {
  session: string;
  ref: string | null;
  debut: string;
  tours: number;
  questions: string[];
  /** Réponses aux questions de vérification : bonnes / données (les questions sans bonne réponse ne comptent pas). */
  verifications: { bonnes: number; total: number };
  interrompus: number;
}

/** Regroupe les tours par séance, dans l'ordre ; la référence est celle du premier tour qui en a une. */
export function summarizeSessions(turns: readonly TurnRecord[]): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>();
  for (const turn of turns) {
    const key = turn.session ? shortSession(turn.session) : "sans-session";
    let summary = bySession.get(key);
    if (!summary) {
      summary = { session: key, ref: null, debut: turn.at, tours: 0, questions: [], verifications: { bonnes: 0, total: 0 }, interrompus: 0 };
      bySession.set(key, summary);
    }
    summary.tours++;
    if (!summary.ref && turn.ref) summary.ref = turn.ref;
    // « question » ouvre une séance, « followUp » est une question posée en cours de route ; « continue » est une réponse.
    if (turn.mode !== "continue" && turn.question.trim()) summary.questions.push(turn.question.slice(0, 160));
    if (turn.answer && turn.answer.correct !== null) {
      summary.verifications.total++;
      if (turn.answer.correct) summary.verifications.bonnes++;
    }
    if (turn.outcome !== "complete") summary.interrompus++;
  }
  return [...bySession.values()];
}

/** Vrai si l'enregistrement a dépassé la durée de conservation (en jours). */
export function isOlderThan(uploadedAt: Date, days: number, now: Date): boolean {
  return now.getTime() - uploadedAt.getTime() > days * 24 * 3_600_000;
}

/** Durée de conservation annoncée dans la politique de confidentialité. */
export const RETENTION_DAYS = 365;
