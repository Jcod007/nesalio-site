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

/**
 * Le nom d'un point : un identifiant, avec un ou deux primes pour une image (A', A'').
 * Le prime typographique (A′) est ramené à l'apostrophe que le moteur donne aux images.
 */
const PointName = z
  .string()
  .trim()
  .transform((name) => name.replace(/[′’]/g, "'"))
  .pipe(z.string().regex(/^[a-zA-Z][\w-]{0,31}'{0,2}$/, "Point : un nom (A, M, A') ou des coordonnées"));

export const PointRef = z.union([Coord, PointName]);
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
    // Le point dessiné de ce sommet (un point construit, nommé E) : sa place réelle, même s'il a été
    // déplacé seul (transform), ce que la place enregistrée du sommet ne suit pas (séance du 21 octobre :
    // E glissé vers le haut, mais « E » visait encore l'ancienne place).
    const drawn = group.members.map((id) => state.nodes[id]).find((n) => isVisible(n) && n.type === "point" && n.label?.trim() === ref);
    if (drawn?.type === "point") return add(drawn.at, drawn.offset);
    const part = group.members.map((id) => state.nodes[id]).find(isVisible);
    if (!part) continue;
    return add(vertex, part.offset);
  }
  return null;
}

/** Une droite : un segment du tableau (ou une construction qui en contient un), ou deux points. */
export const LineRef = z.preprocess(
  // ["d"] : un id de droite mis dans une liste (vu le 21 octobre, axe de réflexion).
  (ref) => (Array.isArray(ref) && ref.length === 1 && typeof ref[0] === "string" ? ref[0] : ref),
  z.union([Id, z.tuple([PointRef, PointRef])]),
);
export type LineRef = z.infer<typeof LineRef>;

export function resolveLine(state: BoardState, ref: LineRef): [Vec2, Vec2] | null {
  if (typeof ref === "string") {
    // Un segment, ou une construction (son trait : médiatrice, bissectrice, médiane).
    const ids = state.nodes[ref] ? [ref] : (state.groups[ref]?.members ?? []);
    for (const id of ids) {
      const node = state.nodes[id];
      if (isVisible(node) && (node.type === "segment" || node.type === "vector")) return [add(node.from, node.offset), add(node.to, node.offset)];
    }
    return null;
  }
  const p = resolvePoint(state, ref[0]);
  const q = resolvePoint(state, ref[1]);
  if (!p || !q || (p[0] === q[0] && p[1] === q[1])) return null;
  return [p, q];
}
