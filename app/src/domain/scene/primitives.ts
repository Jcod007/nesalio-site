/**
 * Briques de validation partagées par toutes les commandes du langage de scène.
 */
import { z } from "zod";
import { tryCompileExpression } from "@/domain/math/expr";

/** Palette nommée : le modèle choisit une intention, le rendu choisit la couleur de marque. */
export const ColorName = z.enum(["violet", "blue", "green", "orange", "ink", "muted"]);
export type ColorName = z.infer<typeof ColorName>;

export const finite = z.number().finite();
export const Coord = z.tuple([finite, finite]);
export const Range = z
  .tuple([finite, finite])
  .refine(([a, b]) => b > a, { message: "L'intervalle doit être croissant" });
export const Id = z
  .string()
  .regex(/^[a-zA-Z][\w-]{0,31}$/, "Identifiant : lettres, chiffres, - ou _ (32 caractères max.)");
export const ShortText = z.string().trim().min(1).max(80);

export const Expression = z
  .string()
  .min(1)
  .max(200)
  .refine((source) => tryCompileExpression(source) !== null, { message: "Expression mathématique invalide" });

/** Côté d'un objet où poser un texte ou un autre objet. */
export const Side = z.enum(["above", "below", "left", "right"]);
export type Side = z.infer<typeof Side>;

export const TextSize = z.enum(["small", "normal", "large"]);
export type TextSize = z.infer<typeof TextSize>;
