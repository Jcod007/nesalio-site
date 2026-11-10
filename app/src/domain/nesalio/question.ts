/**
 * Questions posées à l'élève pendant une leçon Nesalio, pour vérifier qu'il a compris (demande de
 * l'utilisateur, 2026-11-10). Le modèle écrit, après une tranche, une ligne {"question": {...}} au format `Check`
 * de l'ancien tuteur (choix, bonne réponse, réaction juste / fausse, erreur révélée par chaque choix) ; le lecteur
 * s'arrête à la fin de cette tranche, l'élève répond, la réponse est vérifiée sur place sans appel au modèle.
 */
import { z } from "zod";
import { Check } from "@/domain/tutor/dialogue";
import { Id } from "./contract";

/** At most this many questions in one lesson: they check the key idea, they do not replace the explanation. */
export const MAX_QUESTIONS = 2;

/** A verification question: it has a right answer (an open question without one is not asked). */
export const LessonQuestion = z.object({
  id: Id,
  /** The tranche after which it is asked. */
  after: Id,
  check: Check.refine((check) => check.answer !== undefined, { message: "Donne la bonne réponse (answer).", path: ["answer"] }),
});
export type LessonQuestion = z.infer<typeof LessonQuestion>;

/** How the student's choice is judged, and what Nesa says about it. */
export function judge(question: LessonQuestion, choice: number): { right: boolean; say: string } {
  const { check } = question;
  const right = choice === check.answer;
  if (right) return { right, say: check.ifRight ?? "C'est ça !" };
  const why = check.why?.[choice]?.trim();
  const base = check.ifWrong ?? "Pas tout à fait.";
  return { right, say: why ? `${base} ${why.charAt(0).toUpperCase()}${why.slice(1)}${/[.!?]$/.test(why) ? "" : "."}` : base };
}
