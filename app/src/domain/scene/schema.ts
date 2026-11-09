/**
 * Le langage de scène : le contrat entre le modèle et le tableau.
 *
 * Le modèle ne dessine jamais lui-même. Il décrit une explication sous forme
 * d'événements (une ligne JSON chacun) :
 *   1. un en-tête `lesson` (titre, cadre du graphique) ;
 *   2. des étapes `step` : une phrase à dire et des commandes de dessin ;
 *   3. une fin `end` avec le résumé de la séance.
 *
 * Tout ce qui arrive du modèle est validé ici avant d'atteindre le moteur :
 * une ligne invalide est ignorée, jamais exécutée. Les commandes de dessin
 * sont définies une par une dans `commands/` (registre).
 */
import { z } from "zod";
import { Action } from "./commands";
import { TeachingAnnotation } from "@/domain/tutor/learning";
import { AwaitEvent, Check, DiagnosisEvent, EndEvent, ErrorEvent, PlanEvent, SourceEvent } from "@/domain/tutor/dialogue";
export {
  AwaitEvent, Check, Diagnosis, DiagnosisEvent, EndEvent, ErrorEvent, Gap, GapStatus, Noticed, PlanEvent,
  SourceEvent, SourceKind,
} from "@/domain/tutor/dialogue";

export { ColorName } from "./primitives";
export { Action, type ActionType } from "./commands";

/* --------------------------------- étapes --------------------------------- */

export const Mood = z.enum(["explique", "dessine", "question", "idee", "bravo"]);
export type Mood = z.infer<typeof Mood>;

export const LegacyStep = z.object({
  say: z.string().trim().min(1).max(320),
  mood: Mood.optional(),
  do: z.array(Action).max(12).default([]),
  check: Check.optional(),
  /** Rôle pédagogique déclaré ; sa lecture complète est suivie séparément des réponses. */
  teaching: TeachingAnnotation.optional(),
  /**
   * Moment où chaque objet apparaît, en fraction de la phrase (0 = début).
   * Calculé à partir des repères {id} écrits dans « say » (voir tutor/cues.ts).
   */
  cues: z.record(z.string(), z.number().min(0).max(1)).optional(),
  segments: z.never().optional(),
});
export type LegacyStep = z.infer<typeof LegacyStep>;

const Segment = z.object({
  say: z.string().trim().min(1).max(320).refine((text) => !/\{[A-Za-z][\w-]{0,31}\}/.test(text), "Repère interdit dans un segment"),
  do: z.array(Action).max(12).default([]),
});

export const SegmentedStep = z.object({
  segments: z.array(Segment).min(1).max(6),
  say: z.never().optional(), do: z.never().optional(), cues: z.never().optional(),
  mood: Mood.optional(),
  check: Check.optional(),
  teaching: TeachingAnnotation.optional(),
}).refine((step) => step.segments.reduce((n, segment) => n + segment.do.length, 0) <= 12, "12 actions au maximum par étape");
export type SegmentedStep = z.infer<typeof SegmentedStep>;

export const Step = z.union([LegacyStep, SegmentedStep]);
export type Step = z.infer<typeof Step>;

/* -------------------------------- événements -------------------------------- */

export const LessonHeaderEvent = z.object({
  kind: z.literal("lesson"),
  title: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(80).optional(),
  /** 2 ou 3 objectifs : ce que l'élève aura compris à la fin ; le dernier est l'idée centrale de la notion. */
  goals: z.array(z.string().trim().min(1).max(120)).max(4).optional(),
});

export const StepEvent = z.union([LegacyStep.extend({ kind: z.literal("step") }), SegmentedStep.safeExtend({ kind: z.literal("step") })]);

/** Ce que le modèle a le droit d'émettre. */
export const ModelEvent = z.union([LessonHeaderEvent, StepEvent, EndEvent, DiagnosisEvent, PlanEvent]);
export type ModelEvent = z.infer<typeof ModelEvent>;

export const StreamEvent = z.union([
  LessonHeaderEvent,
  StepEvent,
  EndEvent,
  DiagnosisEvent,
  ErrorEvent,
  SourceEvent,
  PlanEvent,
  AwaitEvent,
]);
export type StreamEvent = z.infer<typeof StreamEvent>;
export type LessonHeader = z.infer<typeof LessonHeaderEvent>;
export type StepEventT = z.infer<typeof StepEvent>;
export type EndEventT = z.infer<typeof EndEvent>;
export type DiagnosisEventT = z.infer<typeof DiagnosisEvent>;

/** Une séance complète (utile pour les séances de démonstration et les tests). */
export interface Lesson {
  header: LessonHeader;
  steps: Step[];
  end: EndEventT;
}
