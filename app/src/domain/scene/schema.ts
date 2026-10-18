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
 * une ligne invalide est ignorée, jamais exécutée.
 */
import { z } from "zod";
import { tryCompileExpression } from "@/domain/math/expr";

/** Palette nommée : le modèle choisit une intention, le rendu choisit la couleur de marque. */
export const ColorName = z.enum(["violet", "blue", "green", "orange", "ink", "muted"]);
export type ColorName = z.infer<typeof ColorName>;

const finite = z.number().finite();
const Coord = z.tuple([finite, finite]);
const Range = z
  .tuple([finite, finite])
  .refine(([a, b]) => b > a, { message: "L'intervalle doit être croissant" });
const Id = z
  .string()
  .regex(/^[a-zA-Z][\w-]{0,31}$/, "Identifiant : lettres, chiffres, - ou _ (32 caractères max.)");
const ShortText = z.string().trim().min(1).max(80);

const Expression = z
  .string()
  .min(1)
  .max(200)
  .refine((source) => tryCompileExpression(source) !== null, { message: "Expression mathématique invalide" });

/* ---------------------------- commandes de dessin ---------------------------- */

export const AxesAction = z.object({
  type: z.literal("axes"),
  x: Range,
  y: Range,
  xLabel: z.string().max(12).optional(),
  yLabel: z.string().max(12).optional(),
});

export const CurveAction = z.object({
  type: z.literal("curve"),
  id: Id,
  fn: Expression,
  from: finite.optional(),
  to: finite.optional(),
  color: ColorName.optional(),
  style: z.enum(["solid", "dashed", "dotted"]).optional(),
  label: z.string().max(40).optional(),
});

export const PointAction = z.object({
  type: z.literal("point"),
  id: Id,
  at: Coord,
  label: z.string().max(40).optional(),
  color: ColorName.optional(),
  ring: z.boolean().optional(),
});

export const VectorAction = z.object({
  type: z.literal("vector"),
  id: Id,
  from: Coord,
  to: Coord,
  label: z.string().max(24).optional(),
  color: ColorName.optional(),
});

export const SegmentAction = z.object({
  type: z.literal("segment"),
  id: Id,
  from: Coord,
  to: Coord,
  label: z.string().max(24).optional(),
  color: ColorName.optional(),
  dashed: z.boolean().optional(),
});

export const TextAction = z.object({
  type: z.literal("text"),
  id: Id,
  at: Coord,
  text: z.string().trim().min(1).max(60),
  color: ColorName.optional(),
});

/** Ligne écrite à la main dans la colonne de calculs, en haut à droite. */
export const NoteAction = z.object({
  type: z.literal("note"),
  id: Id.optional(),
  text: z.string().trim().min(1).max(60),
});

/** Étiquette de diagnostic, par exemple « Ce qui bloque : isoler une expression (sec 3) ». */
export const TagAction = z.object({
  type: z.literal("tag"),
  text: ShortText,
  tone: z.enum(["warn", "ok", "info"]).optional(),
});

export const HighlightAction = z.object({ type: z.literal("highlight"), target: Id });
export const EraseAction = z.object({ type: z.literal("erase"), target: Id });

/** Recadre la caméra sur une zone du graphique (coordonnées mathématiques). */
export const FocusAction = z.object({
  type: z.literal("focus"),
  x: Range,
  y: Range,
});

/** Retour à la vue d'ensemble. */
export const ResetViewAction = z.object({ type: z.literal("resetView") });

export const Action = z.discriminatedUnion("type", [
  AxesAction,
  CurveAction,
  PointAction,
  VectorAction,
  SegmentAction,
  TextAction,
  NoteAction,
  TagAction,
  HighlightAction,
  EraseAction,
  FocusAction,
  ResetViewAction,
]);
export type Action = z.infer<typeof Action>;
export type ActionType = Action["type"];

/** Commandes qui laissent un objet sur le tableau (et qu'on peut donc cibler). */
export type DrawableAction = Extract<Action, { type: "curve" | "point" | "vector" | "segment" | "text" }>;

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
    prompt: z.string().trim().min(1).max(200),
    choices: z.array(z.string().trim().min(1).max(60)).min(2).max(4),
    answer: z.number().int().min(0).optional(),
    ifRight: z.string().trim().min(1).max(200).optional(),
    ifWrong: z.string().trim().min(1).max(240).optional(),
  })
  .refine((check) => check.answer === undefined || check.answer < check.choices.length, {
    message: "La bonne réponse doit désigner un des choix",
    path: ["answer"],
  });
export type Check = z.infer<typeof Check>;

export const Step = z.object({
  say: z.string().trim().min(1).max(320),
  mood: Mood.optional(),
  do: z.array(Action).max(12).default([]),
  check: Check.optional(),
});
export type Step = z.infer<typeof Step>;

/* -------------------------------- événements -------------------------------- */

export const LessonHeaderEvent = z.object({
  kind: z.literal("lesson"),
  title: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(80).optional(),
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
