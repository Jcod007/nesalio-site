import { z } from "zod";
import { ArithmeticVerification } from "./assessment";
import { TeachingPlan } from "./plan";

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
    verification: ArithmeticVerification.optional(),
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

/**
 * Ce que Nesa a remarqué chez l'élève, dit à l'élève en fin de séance (« tu ») :
 * ses forces, et au plus deux choses concrètes à travailler.
 */
/**
 * Textes de fin de séance et de diagnostic : un mot de trop ou une ligne de trop ne doit pas
 * faire perdre tout le bilan (séances du 19 octobre) ; on raccourcit au lieu de rejeter.
 */
const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((t) => t.slice(0, max));
const clippedList = (max: number, count: number) =>
  z
    .array(clipped(max))
    .transform((items) => items.filter((t) => t.length > 0).slice(0, count))
    .default([]);

export const Noticed = z.object({
  strengths: clippedList(140, 3),
  toWork: clippedList(140, 2),
});
export type Noticed = z.infer<typeof Noticed>;

export const EndEvent = z.object({
  kind: z.literal("end"),
  /** Fin d'un bloc ; un refus ou une clarification ne certifie jamais un apprentissage. */
  reason: z.enum(["completed", "pause", "out-of-scope", "clarification"]).optional(),
  summary: z.array(z.string().trim().min(1).max(120)).max(5).default([]),
  noticed: Noticed.optional(),
});

/**
 * Fiche de diagnostic de Nesa, invisible pour l'élève : les lacunes d'avant
 * qu'elle envisage derrière ses erreurs, et où elle en est avec chacune.
 * Rendue au modèle à chaque tour (elle se met à jour) et gardée dans les
 * séances enregistrées.
 */
export const GapStatus = z.enum(["suspected", "confirmed", "ruled_out", "repaired"]);
export const Gap = z.object({
  /** La notion d'avant (« fractions : dénominateur commun »). */
  notion: z
    .string()
    .trim()
    .min(1)
    .transform((t) => t.slice(0, 120)),
  /** Où elle s'apprend (« sec 1 »). */
  level: clipped(30).optional(),
  /** Ce qui, dans les réponses de l'élève, le fait penser. */
  evidence: z
    .string()
    .trim()
    .transform((t) => t.slice(0, 240))
    .optional(),
  status: GapStatus,
});
export const Diagnosis = z.object({
  gaps: z
    .array(Gap)
    .transform((gaps) => gaps.slice(0, 4))
    .default([]),
  strengths: clippedList(120, 3),
  /** Ce que Nesa fait au prochain tour (vérifier, réparer, revenir à la notion). */
  next: z
    .string()
    .trim()
    .transform((t) => t.slice(0, 200))
    .optional(),
});
export type Diagnosis = z.infer<typeof Diagnosis>;
export const DiagnosisEvent = Diagnosis.extend({ kind: z.literal("diagnosis") });

export const PlanEvent = z.object({ kind: z.literal("plan"), plan: TeachingPlan });

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
export const AwaitEvent = z.object({
  kind: z.literal("await"),
  /** Commandes du tour refusées par le validateur (raison courte) : rendues au modèle au tour suivant. */
  rejected: z.array(z.string().max(200)).max(6).optional(),
});
export const SourceKind = z.enum(["model", "demo"]);
export type SourceKind = z.infer<typeof SourceKind>;
export const SourceEvent = z.object({
  kind: z.literal("source"),
  source: SourceKind,
});
