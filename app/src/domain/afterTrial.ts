/**
 * Questions posées juste après un premier essai de l'outil. Elles remplacent
 * trois des quatre questions du formulaire du site : posées après l'essai, la
 * personne répond en ayant vécu l'outil (« est-ce que ça t'aurait aidé ? »).
 * `ref` relie ces réponses à l'inscription sans faire passer le courriel dans l'adresse.
 */
import { z } from "zod";
import { REF_PATTERN } from "@/domain/session";

export const HELPED = ["Oui, beaucoup", "Un peu", "Pas vraiment", "Je ne sais pas"] as const;
/** Ce que la personne a trouvé le plus utile pendant l'essai (plusieurs choix possibles) : la valeur perçue. */
export const USEFUL = [
  "Les dessins qui se construisent au tableau",
  "L'explication à voix haute",
  "Les questions pour vérifier si j'ai compris",
  "Pouvoir poser mes questions en cours de route",
  "Avoir de l'aide tout de suite, à n'importe quelle heure",
  "Rien de particulier",
] as const;
export const SPENDING = ["0 $", "Moins de 50 $", "50 à 150 $", "Plus de 150 $", "Je ne sais pas"] as const;
export const URGENCY = ["Moins de 2 semaines", "Ce mois-ci", "Plus tard dans la session", "Pas d'examen prévu"] as const;

/** Référence anonyme créée par le site à l'inscription (lettres et chiffres). */
export const RefSchema = z.string().regex(REF_PATTERN);

export const AfterTrialSchema = z.object({
  ref: RefSchema.optional(),
  helped: z.enum(HELPED),
  why: z.string().trim().max(600).optional(),
  useful: z.array(z.enum(USEFUL)).max(USEFUL.length).optional(),
  missing: z.string().trim().max(600).optional(),
  whatYouDid: z.string().trim().max(600).optional(),
  spending: z.enum(SPENDING).optional(),
  urgency: z.enum(URGENCY).optional(),
  question: z.string().max(500).optional(),
});
export type AfterTrial = z.infer<typeof AfterTrialSchema>;

/** La référence passée par le site dans l'adresse (?ref=…), si elle est valide. */
export function refFromSearch(search: string): string | undefined {
  const ref = new URLSearchParams(search).get("ref");
  return ref && RefSchema.safeParse(ref).success ? ref : undefined;
}
