/**
 * Requête du navigateur vers le serveur.
 *
 * - `question` : une nouvelle question, tableau vierge.
 * - `followUp` : l'élève a interrompu ou pose une question sur la séance en
 *   cours ; on joint ce qui a déjà été dit et dessiné pour que Nesa reparte
 *   de là au lieu de tout recommencer.
 * - `continue` : l'élève a répondu à la question de Nesa ; elle réagit à sa
 *   réponse et poursuit la séance (tour suivant).
 */
import { z } from "zod";
import { Diagnosis } from "@/domain/scene/schema";
import { LearningState } from "./learning";
import { TeachingProgram } from "./program";

export const MAX_QUESTION_LENGTH = 500;

export const BoardSummaryItemSchema = z.object({
  id: z.string().max(40),
  type: z.string().max(20),
  detail: z.string().max(160),
});

export const TutorContextSchema = z.object({
  title: z.string().max(80).optional(),
  originalQuestion: z.string().max(MAX_QUESTION_LENGTH).optional(),
  /** Phrases déjà dites par Nesa, de la plus ancienne à la plus récente. */
  spoken: z.array(z.string().max(320)).max(16),
  board: z.array(BoardSummaryItemSchema).max(40),
  /** Vrai si l'élève a coupé Nesa au milieu d'une phrase. */
  interrupted: z.boolean().optional(),
  /** Nombre de questions auxquelles l'élève a déjà répondu dans la séance (pour doser sa longueur). */
  answered: z.number().int().min(0).max(50).optional(),
  /** Objectifs de la séance, fixés par Nesa au premier tour : ils gardent le cap d'un tour à l'autre. */
  goals: z.array(z.string().max(120)).max(4).optional(),
  /** Réponses précédentes de l'élève dans la séance (la plus récente en dernier). */
  answers: z
    .array(
      z.object({
        prompt: z.string().max(300),
        picked: z.string().max(300),
        correct: z.boolean().nullable(),
        misconception: z.string().max(160).optional(),
      }),
    )
    .max(8)
    .optional(),
  /** Relecture du tour précédent (dit sans montrer, objets absents…), rendue au modèle pour qu'il se corrige. */
  review: z.array(z.string().max(240)).max(4).optional(),
  /** Dernière fiche de diagnostic de Nesa dans la séance (lacunes envisagées, forces, suite prévue). */
  diagnosis: Diagnosis.optional(),
  /** Observations par notion dans cette séance ; enseigné ne signifie jamais appris. */
  learning: LearningState.optional(),
  program: TeachingProgram.optional(),
});

/** Réponse de l'élève à la dernière question de Nesa. */
export const StudentAnswerSchema = z.object({
  prompt: z.string().max(300),
  choices: z.array(z.string().max(140)).max(4),
  /** Le choix retenu, ou la réponse libre de l'élève (dite ou tapée). */
  picked: z.string().max(300),
  /** null pour une question sans bonne réponse (situer l'élève). */
  correct: z.boolean().nullable(),
  /** L'erreur de raisonnement que ce choix révèle, telle que Nesa l'a prévue en écrivant la question. */
  misconception: z.string().max(160).optional(),
  concept: z.string().trim().min(1).max(80).optional(),
  support: z.enum(["guided", "independent"]).optional(),
});

export const TutorRequestSchema = z.object({
  mode: z.enum(["question", "followUp", "continue"]),
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  context: TutorContextSchema.optional(),
  answer: StudentAnswerSchema.optional(),
});

export type TutorRequest = z.infer<typeof TutorRequestSchema>;
export type TutorContext = z.infer<typeof TutorContextSchema>;
export type StudentAnswer = z.infer<typeof StudentAnswerSchema>;
