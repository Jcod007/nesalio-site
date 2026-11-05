/**
 * Moteur de placement : l'IA dit « quoi » (« ce calcul, à droite du point A »),
 * le moteur décide « où ». Fonctions pures, en coordonnées mathématiques.
 *
 * Il place un texte à côté d'un objet sans chevaucher ce qui est déjà écrit,
 * pose les étiquettes, fait de la place aux objets qui arrivent et agrandit
 * le cadre quand une figure en déborde.
 */
import { insidePolygon } from "../shapes";
import { anchoredTo, isVisible, moveNodes, putNode, resolveTargets, visibleNodes, type BoardState, type Reveal, type TextNode, type Vec2 } from "../state";
import type { Side } from "@/domain/scene/primitives";
import { boxAround, boxCenter, boxExtent, union } from "./boxes";
import { FONT_SIZE, mathSize, scales, textExtent, textNodeExtent, type Box, type Extent } from "./measure";
import { bodyBox, defaultLabelCenter, hasLabel, labelBox, nodeBox } from "./nodeBoxes";
import { crowding, footprints, FREE, obstacles, padded, type Part } from "./occupancy";

/** Écart entre un objet et le texte qui l'accompagne (unités du monde). */
const GAP = 0.18;

/**
 * Sans repère, le cadre s'agrandit pour contenir une figure qui en déborde (Pythagore 6-8 avec
 * ses carrés, un cercle de rayon 5). Sinon la caméra dézoome pour tout montrer et le texte,
 * de taille fixe dans le monde, devient illisible (séances du 19 octobre). Le cadre ne
 * rapetisse jamais (sauf "clear") ; les étiquettes déjà posées reprennent leur place.
 * `box` : la figure qui arrive, en coordonnées mathématiques.
 */
export function fitFrame(state: BoardState, box: Box): BoardState {
  if (state.axes) return state;
  const f = state.frame;
  const margin = Math.max(box.x1 - box.x0, box.y1 - box.y0) * 0.1 + 0.6;
  const x0 = box.x0 < f.x[0] ? box.x0 - margin : f.x[0];
  const x1 = box.x1 > f.x[1] ? box.x1 + margin : f.x[1];
  const y0 = box.y0 < f.y[0] ? box.y0 - margin : f.y[0];
  const y1 = box.y1 > f.y[1] ? box.y1 + margin : f.y[1];
  if (x0 === f.x[0] && x1 === f.x[1] && y0 === f.y[0] && y1 === f.y[1]) return state;
  let next: BoardState = { ...state, frame: { ...f, x: [x0, x1], y: [y0, y1] } };
  for (const node of visibleNodes(next)) if (hasLabel(node)) next = placeLabel(next, node.id);
  return next;
}

/* -------------------------------- placement -------------------------------- */

const SIDES: Side[] = ["right", "above", "below", "left"];

/** Centre d'une boîte de taille `size` posée du côté `side` de `target`. */
function besideCenter(target: Box, size: Extent, side: Side, gap: Extent): Vec2 {
  const [cx, cy] = boxCenter(target);
  switch (side) {
    case "right":
      return [target.x1 + gap.w + size.w / 2, cy];
    case "left":
      return [target.x0 - gap.w - size.w / 2, cy];
    case "above":
      return [cx, target.y1 + gap.h + size.h / 2];
    case "below":
      return [cx, target.y0 - gap.h - size.h / 2];
  }
}

/**
 * Où poser une boîte de taille `size` à côté de `target` : le côté demandé
 * s'il est libre, sinon le premier côté libre, sinon le côté demandé quand même.
 * `ignore` : nœuds à ne pas considérer comme des obstacles (la cible, ce qui bouge avec).
 */
export function placeBeside(
  state: BoardState,
  size: Extent,
  target: Box,
  side: Side | undefined,
  ignore: ReadonlySet<string>,
  keep: ReadonlySet<string> = new Set(),
): { center: Vec2; side: Side } {
  const s = scales(state.frame);
  // Les objets ignorés (la cible) ne gênent pas, sauf leurs étiquettes (`keep`) : un texte posé
  // à côté d'un point ne recouvre pas le nom du point.
  const clutter = obstacles(state, new Set(), (owner, part) => ignore.has(owner) && !(part === "label" && keep.has(owner)));
  const order = side ? [side, ...SIDES.filter((s) => s !== side)] : SIDES;
  // Le côté demandé s'il est libre ; sinon le premier côté libre ; sinon un peu plus loin ;
  // en dernier recours, l'emplacement le moins encombré.
  let best: { center: Vec2; side: Side; score: number } | null = null;
  const candidates = (distance: number): Array<{ side: Side; center: Vec2 }> => {
    // Écart en unités du monde (le même à l'écran sur les deux axes), puis en coordonnées mathématiques.
    const world = GAP * distance + (distance > 1 ? size.h * s.y * (distance - 1) * 0.5 : 0);
    const away = mathSize(state.frame, world, world);
    const sides = order.map((candidate) => ({ side: candidate, center: besideCenter(target, size, candidate, away) }));
    // Les coins (en diagonale de l'objet), après les quatre côtés.
    const corners = (["right", "left"] as const).flatMap((horizontal) =>
      (["above", "below"] as const).map((vertical) => {
        const [x] = besideCenter(target, size, horizontal, away);
        const [, y] = besideCenter(target, size, vertical, away);
        return { side: horizontal as Side, center: [x, y] as Vec2 };
      }),
    );
    return [...sides, ...corners];
  };
  for (const distance of [1, 2.5]) {
    for (const { side: candidate, center } of candidates(distance)) {
      const crowd = clutter(padded(state.frame, boxAround(center, size)));
      if (crowd < FREE) return { center, side: candidate };
      const score = crowd + (distance - 1) * 0.01;
      if (!best || score < best.score) best = { center, side: candidate, score };
    }
  }
  // Aucun côté libre : la place libre la plus proche du côté demandé.
  const preferred = candidates(1)[0]!;
  return { center: placeNear(state, size, preferred.center, clutter), side: preferred.side };
}

/**
 * La place libre la plus proche de `desired` pour une boîte de taille `size` :
 * l'endroit demandé s'il est libre, sinon on s'en éloigne par petits pas (anneaux
 * de 0,12 unité du monde), et l'on garde la première place libre trouvée, la plus
 * proche. Faute de place libre à moins de 4 unités, la moins encombrée.
 */
export function placeNear(state: BoardState, size: Extent, desired: Vec2, score: (box: Box) => number): Vec2 {
  const frame = state.frame;
  const s = scales(frame);
  const cost = (center: Vec2) => score(padded(frame, boxAround(center, size)));
  const here = cost(desired);
  if (here < FREE) return desired;
  let best = { center: desired, value: here };
  const STEP = 0.12;
  for (let k = 1; k <= 34; k++) {
    const r = k * STEP;
    const n = Math.min(48, Math.max(8, Math.round((2 * Math.PI * r) / STEP)));
    let found: Vec2 | null = null;
    for (let i = 0; i < n; i++) {
      // Tour de l'anneau en partant du haut, alternativement à droite et à gauche.
      const turn = Math.ceil(i / 2) * (i % 2 === 0 ? -1 : 1);
      const a = Math.PI / 2 + (turn * 2 * Math.PI) / n;
      const center: Vec2 = [desired[0] + (Math.cos(a) * r) / s.x, desired[1] + (Math.sin(a) * r) / s.y];
      const value = cost(center);
      if (value < FREE) {
        found = center;
        break;
      }
      if (value + r * 0.02 < best.value) best = { center, value: value + r * 0.02 };
    }
    if (found) return found;
  }
  return best.center;
}

/* --------------------------- place des étiquettes --------------------------- */

/**
 * Surfaces remplies qui recouvrent déjà les objets donnés (le milieu d'un côté
 * sous un carré, un point dans un polygone) : un texte qui nomme ces objets
 * peut s'y poser, sinon il serait exilé loin de ce qu'il désigne.
 */
function regionsOver(state: BoardState, ids: readonly string[]): Set<string> {
  const centers = ids.flatMap((id) => {
    const node = state.nodes[id];
    return isVisible(node) ? [boxCenter(bodyBox(node, state.frame))] : [];
  });
  const over = new Set<string>();
  for (const node of visibleNodes(state)) {
    if (node.type !== "polygon" || !node.fill || node.shade || !node.closed || ids.includes(node.id)) continue;
    const ring = node.points.map(([x, y]) => [x + node.offset[0], y + node.offset[1]] as Vec2);
    // Franchement à l'intérieur : un côté qui borde le carré (le milieu sur son bord) n'est pas recouvert.
    const e = mathSize(state.frame, 0.02, 0.02);
    const within = (c: Vec2) =>
      [
        [0, 0],
        [e.w, 0],
        [-e.w, 0],
        [0, e.h],
        [0, -e.h],
      ].every(([dx, dy]) => insidePolygon([c[0] + dx!, c[1] + dy!], ring));
    if (centers.some(within)) over.add(node.id);
  }
  return over;
}

/**
 * Surfaces sur lesquelles le texte (ou l'étiquette) de `owner` a le droit de se
 * poser : celles qui recouvrent déjà ce qu'il nomme. Partagé avec la mesure.
 */
export function namingRegions(state: BoardState, owner: string): Set<string> {
  const node = state.nodes[owner];
  if (!isVisible(node)) return new Set();
  if (node.type === "text") return node.anchor ? regionsOver(state, resolveTargets(state, node.anchor.target)) : new Set();
  return regionsOver(state, [owner]);
}

/** Ce que l'on ne compte pas comme obstacle pour un texte qui nomme `targets` (`self` : le texte, ou l'objet de l'étiquette). */
function namingSkip(state: BoardState, self: string, targets: readonly string[], ownBody: boolean): (owner: string, part: Part) => boolean {
  const over = regionsOver(state, targets);
  return (owner, part) =>
    (owner === self && (ownBody ? part === "body" || part === "label" || part === "region" : part === "label" || part === "region")) ||
    (part === "region" && over.has(owner));
}

/** Ce qu'un objet ne compte pas comme obstacle pour sa propre étiquette : l'étiquette elle-même, sa surface, et les surfaces qui le recouvrent. */
const ownLabel = (state: BoardState, id: string) => namingSkip(state, id, [id], false);

/** Ce qu'un texte ne compte pas : lui-même, et les surfaces qui recouvrent déjà l'objet qu'il accompagne. */
const ownText = (state: BoardState, node: TextNode) => {
  const targets = node.anchor ? resolveTargets(state, node.anchor.target) : [];
  return namingSkip(state, node.id, targets, true);
};

/**
 * Pose l'étiquette d'un objet (déjà au tableau) à la place libre la plus proche
 * de sa place habituelle : à côté du point, du milieu du segment, du bout du
 * vecteur… Elle évite les textes, les autres étiquettes, les points, les traits
 * (y compris celui de l'objet) et les surfaces remplies.
 */
export function placeLabel(state: BoardState, id: string): BoardState {
  const node = state.nodes[id];
  if (!isVisible(node) || !hasLabel(node)) return state;
  const desired = defaultLabelCenter(node, state.frame);
  if (!desired) return state;
  const size = textExtent(node.label, FONT_SIZE.label, state.frame);
  const [dx, dy] = node.offset;
  const at = placeNear(state, size, [desired[0] + dx, desired[1] + dy], obstacles(state, new Set(), ownLabel(state, id)));
  return putNode(state, { ...node, labelAt: [at[0] - dx, at[1] - dy] });
}

/** Un texte libre (posé avec "at", ou étiquette d'une figure) : à la place libre la plus proche de celle demandée. */
export function placeText(state: BoardState, node: TextNode): TextNode {
  const box = nodeBox(node, state.frame);
  const center = boxCenter(box);
  const to = placeNear(state, boxExtent(box), center, obstacles(state, new Set(), ownText(state, node)));
  if (to === center) return node;
  return { ...node, at: [node.at[0] + to[0] - center[0], node.at[1] + to[1] - center[1]] };
}

/**
 * Fait de la place à des objets qui viennent d'arriver (`arrived` : leurs
 * identifiants, ou AXES_OWNER pour un nouveau repère). Les textes libres et les
 * étiquettes déjà au tableau qu'ils recouvrent glissent jusqu'à la place libre
 * la plus proche ; rien d'autre ne bouge. Les objets eux-mêmes gardent leur
 * place (elle a un sens mathématique) et la pile de calculs se range seule.
 */
export function makeWay(state: BoardState, arrived: readonly string[], reveal: Reveal): BoardState {
  const fresh = new Set(arrived);
  const calc = new Set(state.calc);
  let next = state;
  /** Les nouveaux venus gênent-ils cette boîte (hors ce que `skip` permet) ? */
  const hit = (box: Box, skip: (owner: string, part: Part) => boolean) =>
    crowding(footprints(next, (owner, part) => !fresh.has(owner) || skip(owner, part)))(box) >= FREE;
  for (const id of state.order) {
    const node = next.nodes[id];
    if (!isVisible(node) || fresh.has(id) || calc.has(id)) continue;
    if (node.type === "text") {
      const box = nodeBox(node, next.frame);
      const skip = ownText(next, node);
      if (!hit(box, skip)) continue;
      const center = boxCenter(box);
      const to = placeNear(next, boxExtent(box), center, obstacles(next, new Set(), skip));
      next = moveNodes(next, [id], [to[0] - center[0], to[1] - center[1]], reveal);
    } else if (hasLabel(node)) {
      const box = labelBox(node, next.frame);
      const skip = ownLabel(next, id);
      if (!box || !hit(box, skip)) continue;
      const center = boxCenter(box);
      const to = placeNear(next, boxExtent(box), center, obstacles(next, new Set(), skip));
      // L'étiquette change de place : le rendu la fait glisser (transformation de l'objet).
      next = putNode(next, { ...node, labelAt: [to[0] - node.offset[0], to[1] - node.offset[1]], morph: reveal });
    }
  }
  return next;
}

/**
 * Après qu'un objet a changé de forme (matrice appliquée, transformation), les
 * textes qui l'accompagnent reprennent leur place à côté de lui, en glissant.
 */
export function followAnchors(state: BoardState, changed: readonly string[], reveal: Reveal): BoardState {
  let next = state;
  for (const id of anchoredTo(state, changed)) {
    const text = next.nodes[id];
    if (!isVisible(text) || text.type !== "text" || !text.anchor) continue;
    const targets = resolveTargets(next, text.anchor.target);
    if (targets.length === 0) continue;
    const box = union(targets.map((t) => bodyBox(next.nodes[t]!, next.frame)))!;
    const placed = placeBeside(next, textNodeExtent(text, next.frame), box, text.anchor.side, new Set([id, ...targets]), new Set(targets));
    const now: Vec2 = [text.at[0] + text.offset[0], text.at[1] + text.offset[1]];
    next = moveNodes(next, [id], [placed.center[0] - now[0], placed.center[1] - now[1]], reveal);
  }
  return next;
}
