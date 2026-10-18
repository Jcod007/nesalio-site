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

export { ColorName } from "./primitives";
export { Action, type ActionType } from "./commands";

/* --------------------------------- étapes --------------------------------- */

export const Mood = z.enum(["explique", "dessine", "question", "idee", "bravo"]);
export type Mood = z.infer<typeof Mood>;

/**
 * Question posée à l'élève. Deux sortes :
 * - avec `answer` : question de vérification (une bonne réponse, réaction immédiate ifRight / ifWrong) ;
 * - sans `answer` : question pour situer l'élève (ce qu'il sait, ce qu'il prédit) ; pas de bonne réponse.
 * Dans les deux cas, Nesa attend la réponse avant de continuer.
 */
export const Check = z
  .object({
    prompt: z.string().trim().min(1).max(300),
    // Les modèles formulent parfois des choix en phrase complète : on les accepte (la carte passe à la ligne).
    choices: z.array(z.string().trim().min(1).max(140)).min(2).max(4),
    answer: z.number().int().min(0).optional(),
    ifRight: z.string().trim().min(1).max(300).optional(),
    ifWrong: z.string().trim().min(1).max(300).optional(),
    /**
     * Pour chaque choix (même ordre), l'erreur de raisonnement qu'il révèle ("" pour la bonne réponse).
     * Elle revient au modèle avec la réponse de l'élève : la remédiation vise la bonne erreur.
     */
    why: z.array(z.string().trim().max(160)).max(4).optional(),
  })
  .refine((check) => check.answer === undefined || check.answer < check.choices.length, {
    message: "La bonne réponse doit désigner un des choix",
    path: ["answer"],
  })
  .refine((check) => !check.why || check.why.length <= check.choices.length, {
    message: "why : une explication par choix au plus",
    path: ["why"],
  });
export type Check = z.infer<typeof Check>;

export const Step = z.object({
  say: z.string().trim().min(1).max(320),
  mood: Mood.optional(),
  do: z.array(Action).max(12).default([]),
  check: Check.optional(),
  /**
   * Moment où chaque objet apparaît, en fraction de la phrase (0 = début).
   * Calculé à partir des repères {id} écrits dans « say » (voir tutor/cues.ts).
   */
  cues: z.record(z.string(), z.number().min(0).max(1)).optional(),
});
export type Step = z.infer<typeof Step>;

/* -------------------------------- événements -------------------------------- */

export const LessonHeaderEvent = z.object({
  kind: z.literal("lesson"),
  title: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(80).optional(),
  /** 2 ou 3 objectifs : ce que l'élève aura compris à la fin ; le dernier est l'idée centrale de la notion. */
  goals: z.array(z.string().trim().min(1).max(120)).max(4).optional(),
});

export const StepEvent = Step.extend({ kind: z.literal("step") });

export const EndEvent = z.object({
  kind: z.literal("end"),
  summary: z.array(z.string().trim().min(1).max(120)).max(5).default([]),
});

/** Ce que le modèle a le droit d'émettre. */
export const ModelEvent = z.discriminatedUnion("kind", [LessonHeaderEvent, StepEvent, EndEvent]);
export type ModelEvent = z.infer<typeof ModelEvent>;

/** Ce que le serveur envoie au navigateur : les événements du modèle, plus l'origine et les erreurs. */
export const ErrorEvent = z.object({
  kind: z.literal("error"),
  code: z.enum(["rate_limited", "bad_request", "upstream", "empty"]),
  message: z.string(),
});
/**
 * Fin d'un tour : Nesa a posé une question et attend la réponse de l'élève.
 * La séance continue avec une requête « continue ». Émis par le serveur, jamais par le modèle.
 */
export const AwaitEvent = z.object({ kind: z.literal("await") });
export const SourceEvent = z.object({
  kind: z.literal("source"),
  source: z.enum(["model", "demo"]),
});

export const StreamEvent = z.discriminatedUnion("kind", [
  LessonHeaderEvent,
  StepEvent,
  EndEvent,
  ErrorEvent,
  SourceEvent,
  AwaitEvent,
]);
export type StreamEvent = z.infer<typeof StreamEvent>;
export type LessonHeader = z.infer<typeof LessonHeaderEvent>;
export type StepEventT = z.infer<typeof StepEvent>;
export type EndEventT = z.infer<typeof EndEvent>;

/** Une séance complète (utile pour les séances de démonstration et les tests). */
export interface Lesson {
  header: LessonHeader;
  steps: Step[];
  end: EndEventT;
}
