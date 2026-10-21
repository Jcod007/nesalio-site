/**
 * Parties de figures, partagées par les commandes qui dessinent une figure
 * composée (triangle, plan incliné, secteur, cylindre, constructions, images) :
 * les briques (segment, vecteur, point, étiquette, marque d'angle, traits
 * d'égalité), leur apparition l'une après l'autre, et le groupe qui les réunit
 * sous le nom de la figure.
 */
import { z } from "zod";
import { worldPerMath, type Box } from "@/domain/board/layout";
import { outline } from "@/domain/board/collisions";
import { roomFor } from "@/domain/board/room";
import { add, angleArc, rightAngleMark, scale, sub, unit as direction } from "@/domain/board/shapes";
import { isVisible, moveNodes, putNode, type BoardNode, type BoardState, type Group, type Reveal, type TextNode, type Vec2 } from "@/domain/board/state";
import { ColorName, Id } from "../primitives";
import { base, drawNode } from "./figure";

export type Color = z.infer<typeof ColorName>;

/** Identifiant de figure composée : assez court pour laisser la place aux suffixes. */
export const ShapeId = Id.refine((id) => id.length <= 24, { message: "Identifiant de figure : 24 caractères au plus" });
export const Name = z.string().trim().min(1).max(24);

/** Boîte englobante de quelques points (coordonnées mathématiques). */
export function pointsBox(points: Vec2[]): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Les parties d'une figure apparaissent l'une après l'autre dans le temps de la commande. */
function stagger(reveal: Reveal, index: number, count: number): Reveal {
  const slot = reveal.duration / (count * 0.6 + 0.4);
  return { start: reveal.start + index * slot * 0.6, duration: slot };
}

/**
 * Dessine les parties d'une figure et les réunit dans un groupe portant le nom
 * de la figure. Redemander la même figure avec plus d'options la complète :
 * les parties déjà au tableau restent en place, seules les nouvelles
 * apparaissent (on présente les forces une à une, par exemple).
 */
export function drawFigure(
  state: BoardState,
  id: string,
  parts: BoardNode[],
  reveal: Reveal,
  extraGroups: Record<string, string[]> = {},
  vertices?: Record<string, Vec2>,
): BoardState {
  const fresh = parts.filter((part) => {
    const existing = state.nodes[part.id];
    return !isVisible(existing) || existing.type !== part.type;
  });
  let next = state;
  fresh.forEach((part, i) => {
    next = drawNode(next, { ...part, reveal: stagger(reveal, i, fresh.length) }, reveal);
  });
  for (const part of parts) {
    const existing = next.nodes[part.id];
    if (fresh.includes(part) || !isVisible(existing) || existing.type !== part.type) continue;
    if (part.type === "text" && existing.type === "text") {
      // Une étiquette déjà au tableau dont la place calculée change (on ajoute les carrés, par exemple)
      // glisse vers sa nouvelle place au lieu de rester sous la nouvelle partie.
      const delta: Vec2 = [part.at[0] - existing.at[0] - existing.offset[0], part.at[1] - existing.at[1] - existing.offset[1]];
      if (Math.hypot(delta[0], delta[1]) > 1e-9) next = moveNodes(next, [part.id], delta, reveal);
      continue;
    }
    // Une partie déjà au tableau dont la géométrie change (le plan passe de 30° à 60°) se
    // transforme sous les yeux de l'élève, au lieu de rester figée à l'ancienne valeur.
    if (sameShape(existing, part)) continue;
    next = putNode(next, {
      ...part,
      reveal: existing.reveal,
      offset: existing.offset,
      motions: existing.motions,
      spins: existing.spins,
      dim: existing.dim,
      morph: reveal,
    } as BoardNode);
  }
  const members = [...new Set([...(state.groups[id]?.members ?? []), ...parts.map((p) => p.id)])];
  const groups: Record<string, Group> = { ...next.groups, [id]: { id, members, ...(vertices ? { vertices: { ...state.groups[id]?.vertices, ...vertices } } : {}) } };
  for (const [gid, ids] of Object.entries(extraGroups)) {
    if (ids.length > 0) groups[gid] = { id: gid, members: [...new Set([...(next.groups[gid]?.members ?? []), ...ids])] };
  }
  return { ...next, groups };
}

/** Même géométrie (au millième près) : seuls comptent la forme, pas l'état d'animation. */
const ANIMATION_KEYS = new Set(["reveal", "offset", "motions", "spins", "morph", "dim", "erased"]);
function sameShape(a: BoardNode, b: BoardNode): boolean {
  const shape = (node: BoardNode) =>
    JSON.stringify(node, (key, value) => (ANIMATION_KEYS.has(key) ? undefined : typeof value === "number" ? Math.round(value * 1000) / 1000 : value));
  return shape(a) === shape(b);
}

/** Texte posé à une position calculée, attaché à une partie de la figure (il la suit). */
export function label(id: string, text: string, at: Vec2, target: string, reveal: Reveal, color?: Color): TextNode {
  return { ...base(id, reveal, color), type: "text", text, at, align: "center", size: "normal", role: "free", anchor: { target, side: "above" } };
}

export const segment = (id: string, from: Vec2, to: Vec2, reveal: Reveal, color?: Color, dashed?: boolean, text?: string): BoardNode => ({
  ...base(id, reveal, color),
  type: "segment",
  from,
  to,
  dashed,
  label: text,
});

export const vector = (id: string, from: Vec2, to: Vec2, text: string, reveal: Reveal, color: Color): BoardNode => ({
  ...base(id, reveal, color),
  type: "vector",
  from,
  to,
  label: text,
});

/** Marque d'angle : arc avec étiquette, ou petit carré pour un angle droit. */
export function angleMark(state: BoardState, id: string, vertex: Vec2, a: Vec2, b: Vec2, text: string | undefined, right: boolean, reveal: Reveal, color?: Color): BoardNode {
  const unit = worldPerMath(state.frame);
  if (right) {
    return { ...base(id, reveal, color ?? "muted"), type: "polygon", points: rightAngleMark(vertex, a, b, 0.24 / unit), closed: false, label: text };
  }
  const { start, end } = angleArc(vertex, a, b);
  return { ...base(id, reveal, color ?? "violet"), type: "arc", center: vertex, radius: 0.5 / unit, start, end, label: text };
}

export const point = (id: string, at: Vec2, label: string | undefined, reveal: Reveal, color?: Color): BoardNode => ({
  ...base(id, reveal, color),
  type: "point",
  at,
  label,
});

/** 1 à 3 petits traits d'égalité au milieu de [from, to] (côtés égaux, moitiés d'un segment). */
export function equalTicks(id: string, from: Vec2, to: Vec2, count: number, unit: number, reveal: Reveal, color?: Color): BoardNode[] {
  const u = direction(sub(to, from));
  const n: Vec2 = [-u[1], u[0]];
  const middle = scale(add(from, to), 0.5);
  return Array.from({ length: count }, (_, k) => {
    const at = add(middle, scale(u, ((k - (count - 1) / 2) * 0.1) / unit));
    return segment(`${id}-${k + 1}`, add(at, scale(n, 0.13 / unit)), add(at, scale(n, -0.13 / unit)), reveal, color);
  });
}

/**
 * Un dessin à part posé par-dessus un autre (sans repère) glisse juste à côté (board/room.ts).
 * Le décalage entre dans ses coordonnées : le tableau rendu au modèle donne sa vraie place.
 */
export function withRoom<N extends BoardNode>(state: BoardState, node: N, ignore: ReadonlySet<string> = new Set([node.id])): N {
  const poly = outline(node);
  if (!poly) return node;
  const filled = node.type === "polygon" && (node.fill === true || node.shade === true);
  const [dx, dy] = roomFor(state, poly, filled, ignore);
  if (dx === 0 && dy === 0) return node;
  if (node.type === "polygon") return { ...node, points: node.points.map(([x, y]) => [x + dx, y + dy] as Vec2), labelAt: undefined };
  if (node.type === "circle") return { ...node, center: [node.center[0] + dx, node.center[1] + dy] as Vec2 };
  return node;
}
