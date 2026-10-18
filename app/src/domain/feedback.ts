/**
 * Retour d'un testeur, envoyé depuis l'outil (« Signaler un problème »).
 * Le contexte de la séance est joint seulement si la personne le laisse coché.
 */
import { z } from "zod";

export const FEEDBACK_KINDS = ["bug", "explication", "idee"] as const;
export const FEEDBACK_LABELS: Record<(typeof FEEDBACK_KINDS)[number], string> = {
  bug: "Un bogue (affichage, voix, micro…)",
  explication: "Une explication fausse ou pas claire",
  idee: "Une idée, une suggestion",
};

export const FeedbackContextSchema = z.object({
  question: z.string().max(500).nullable(),
  title: z.string().max(120).nullable(),
  status: z.string().max(20),
  /** Dernières phrases de Nesa (ce que la personne venait d'entendre). */
  recent: z.array(z.string().max(320)).max(8),
  /** Ce qui était au tableau, résumé. */
  board: z.array(z.string().max(200)).max(30),
  screen: z.string().max(40),
  /** Enregistrement exact de la séance (événements reçus, tour par tour), pour la rejouer. */
  replay: z.string().max(16_000).optional(),
  browser: z.string().max(300),
});

export const FeedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z.string().trim().min(3, "Décris le problème en quelques mots.").max(2000),
  email: z.union([z.literal(""), z.email()]).optional(),
  context: FeedbackContextSchema.optional(),
});

export type Feedback = z.infer<typeof FeedbackSchema>;
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;
