import { z } from "zod";

/** État d'un parcours écrit et calculé par le moteur, distinct de la sortie du modèle. */
export const TeachingProgram = z.object({
  id: z.literal("thales-v1"),
  exercise: z.number().int().min(0).max(3),
  phase: z.enum(["explanation", "practice"]),
});
export type TeachingProgram = z.infer<typeof TeachingProgram>;

/** Besoin d'aide général ; les questions précises et changements de sujet restent libres. */
export function isGeneralProgramHelp(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  return /^(?:je (?:ne )?(?:sais|comprends?) (?:toujours |vraiment |encore )?(?:pas|rien)|je debute|je pars de zero)(?:[.!? ,;]+(?:explique[- ]moi (?:autrement|plus simplement)|montre[- ]moi (?:un exemple|la resolution)|aide[- ]moi))*[.!?]*$/.test(normalized);
}
