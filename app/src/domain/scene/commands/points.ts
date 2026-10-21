/**
 * Un point désigné par ses coordonnées ou par son nom : un point du tableau ("A"),
 * ou un sommet nommé d'une figure (le A d'un triangle, le pied H de sa hauteur).
 * Le modèle calcule mal les coordonnées d'un sommet (séances du 19 octobre :
 * hauteur tombée à côté de l'hypoténuse) ; viser le sommet par son nom évite le calcul.
 */
import { z } from "zod";
import { add } from "@/domain/board/shapes";
import { isVisible, type BoardState, type Vec2 } from "@/domain/board/state";
import { Coord, Id } from "../primitives";

export const PointRef = z.union([Coord, Id]);
export type PointRef = z.infer<typeof PointRef>;

export function resolvePoint(state: BoardState, ref: PointRef): Vec2 | null {
  if (typeof ref !== "string") return ref;
  const node = state.nodes[ref];
  if (isVisible(node) && node.type === "point") return add(node.at, node.offset);
  // Sommet d'une figure : la plus récente d'abord (le A du dernier triangle dessiné).
  const groups = Object.values(state.groups).reverse();
  for (const group of groups) {
    const vertex = group.vertices?.[ref];
    if (!vertex) continue;
    const part = group.members.map((id) => state.nodes[id]).find(isVisible);
    if (!part) continue;
    return add(vertex, part.offset);
  }
  return null;
}
