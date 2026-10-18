/**
 * Une commande du langage de scène, décrite en un seul endroit :
 * - son schéma (ce que le modèle a le droit d'écrire, validé avant tout) ;
 * - sa documentation pour le modèle (générée dans les consignes) ;
 * - sa durée d'animation (pour caler le tracé sur la voix) ;
 * - son effet sur le graphe de scène.
 *
 * Le rendu ne connaît pas les commandes : il dessine les nœuds du graphe.
 * Ajouter une commande, c'est donc ajouter un module ici et l'inscrire dans
 * le registre (`index.ts`) ; le reste du code n'a pas à changer.
 */
import type { z } from "zod";
import type { BoardState, Reveal } from "@/domain/board/state";

export interface CommandSpec<S extends z.ZodType<{ type: string }>> {
  schema: S;
  /** Description pour le modèle : une ligne avec un exemple JSON, puis éventuellement des précisions. */
  doc: string;
  /** Durée de l'animation, en ms. */
  duration: number | ((action: z.infer<S>) => number);
  /** Instantanée : ne réserve pas de créneau dans la phrase (mise en évidence, groupe…). */
  quick?: boolean;
  /** Noms que les modèles emploient parfois à la place du vrai nom. */
  aliases?: readonly string[];
  apply(state: BoardState, action: z.infer<S>, reveal: Reveal): BoardState;
}

export function defineCommand<S extends z.ZodType<{ type: string }>>(spec: CommandSpec<S>): CommandSpec<S> {
  return spec;
}
