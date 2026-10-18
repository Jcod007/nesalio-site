/**
 * Enregistrement des séances, pour améliorer Nesalio.
 *
 * Un fichier par TOUR (une requête à /api/tutor) : ce que l'élève a demandé
 * ou répondu, et exactement ce que Nesa lui a envoyé (paroles, dessins,
 * questions, lignes refusées). Les événements gardent le format du flux, donc
 * une séance se rejoue image par image (tools/rejeu).
 *
 * Rien qui identifie la personne : pas de nom, de courriel, d'adresse IP ni
 * d'audio. La session est un identifiant tiré au hasard à l'ouverture de la
 * page (domain/session.ts), qui ne dure que le temps de la page.
 */
import type { StreamEvent } from "@/domain/scene/schema";
import type { TutorRequest } from "@/domain/tutor/request";
import { shortSession } from "@/domain/session";

export type RecordEnv = "production" | "preview" | "development";
export type TurnOutcome = "complete" | "cancelled" | "error";

export interface TurnRecord {
  v: 1;
  env: RecordEnv;
  /** Identifiant de session de la page (hasard), ou null si le navigateur ne l'a pas envoyé. */
  session: string | null;
  /** Début du tour (ISO 8601, UTC). */
  at: string;
  mode: TutorRequest["mode"];
  question: string;
  /** Réponse de l'élève à la question précédente de Nesa (tour « continue »). */
  answer?: { prompt: string; picked: string; correct: boolean | null; misconception?: string };
  /** Objectifs de la séance, tels que Nesa les a fixés au premier tour. */
  goals?: string[];
  source: "model" | "demo";
  model?: string;
  latencyMs: { firstEvent?: number; total: number };
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
  env: RecordEnv;
  source: "model" | "demo";
  model?: string;
  startedAt: Date;
  clock: { now(): number };
}): TurnRecorder {
  const { request, clock } = options;
  const started = clock.now();
  const events: StreamEvent[] = [];
  let firstEvent: number | undefined;
  let ended: number | undefined;
  let outcome: TurnOutcome | undefined;

  return {
    event(event) {
      if (outcome) return;
      if (firstEvent === undefined) firstEvent = clock.now() - started;
      events.push(event);
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
              },
            }
          : {}),
        ...(request.context?.goals?.length ? { goals: [...request.context.goals] } : {}),
        source: options.source,
        ...(options.model ? { model: options.model } : {}),
        latencyMs: { ...(firstEvent !== undefined ? { firstEvent } : {}), total: ended ?? clock.now() - started },
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

/** Vrai si l'enregistrement a dépassé la durée de conservation (en jours). */
export function isOlderThan(uploadedAt: Date, days: number, now: Date): boolean {
  return now.getTime() - uploadedAt.getTime() > days * 24 * 3_600_000;
}

/** Durée de conservation annoncée dans la politique de confidentialité. */
export const RETENTION_DAYS = 365;
