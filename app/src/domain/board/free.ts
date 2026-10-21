/**
 * Positions libres : ce que le modèle a posé « à la main », sans que rien ne le lie à la figure.
 *
 * Sur un tableau SANS repère, les coordonnées n'ont pas de sens pour l'élève : il ne les voit pas.
 * Un point O posé en (0, 0), ou un centre donné en [0, 0], est une position inventée, que le moteur
 * peut déplacer s'il gêne. Séances du 21 octobre : 9 homothéties sur 10 avec un point O posé à la
 * main, souvent dans le triangle, et l'image qui recouvrait l'original.
 *
 * Ce qui n'est PAS libre, et que le moteur ne déplace jamais :
 * - tout, dès qu'un repère est au tableau (« A(1, 2) » fait partie du problème) ;
 * - une relation : un sommet nommé d'une figure (« C »), une construction (milieu, médiatrice),
 *   un point de l'image d'une figure ;
 * - un point posé exactement sur un sommet d'une figure (une relation écrite en coordonnées).
 *
 * Fonctions pures, partagées par les commandes qui ont besoin de faire de la place.
 */
import { add } from "./shapes";
import { isVisible, moveNodes, anchoredTo, updateNodes, type BoardState, type Reveal, type Vec2 } from "./state";

const EPS = 1e-6;
const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

/** Un nœud qui appartient à une figure, une construction ou une image (un groupe). */
function inGroup(state: BoardState, id: string): boolean {
  return Object.values(state.groups).some((g) => g.members.includes(id));
}

/** Les sommets des figures du tableau, à leur place (décalage compris). */
function figureVertices(state: BoardState): Vec2[] {
  const out: Vec2[] = [];
  for (const group of Object.values(state.groups)) {
    const part = group.members.map((id) => state.nodes[id]).find(isVisible);
    if (!part || !group.vertices) continue;
    for (const p of Object.values(group.vertices)) out.push(add(p, part.offset));
  }
  for (const node of Object.values(state.nodes)) {
    if (isVisible(node) && node.type === "polygon") out.push(...node.points.map((p) => add(p, node.offset)));
  }
  return out;
}

/**
 * Une référence de point (nom ou [x,y]) posée librement : les nœuds qui la portent (un point
 * dessiné seul), ou aucun pour des coordonnées brutes. null : une relation, ou un repère au tableau.
 */
export function freePoint(state: BoardState, ref: string | Vec2): { nodes: string[]; at: Vec2 } | null {
  if (state.axes) return null;
  if (typeof ref !== "string") {
    return figureVertices(state).some((v) => same(v, ref)) ? null : { nodes: [], at: ref };
  }
  const node = state.nodes[ref];
  if (!isVisible(node) || node.type !== "point" || inGroup(state, ref)) return null;
  const at = add(node.at, node.offset);
  if (figureVertices(state).some((v) => same(v, at))) return null;
  return { nodes: [ref], at };
}

/**
 * Une droite (id d'un segment, ou deux points) posée librement : un segment dessiné seul, ou
 * deux points libres. null : une construction, un côté de figure, ou un repère au tableau.
 */
export function freeLine(state: BoardState, ref: string | readonly [string | Vec2, string | Vec2]): { nodes: string[] } | null {
  if (state.axes) return null;
  if (typeof ref === "string") {
    const node = state.nodes[ref];
    if (!isVisible(node) || (node.type !== "segment" && node.type !== "vector") || inGroup(state, ref)) return null;
    // Un segment tiré d'un sommet à un autre est une relation (le côté (BC)), même écrit en coordonnées.
    const vertices = figureVertices(state);
    const onVertex = (p: Vec2) => vertices.some((v) => same(v, add(p, node.offset)));
    return onVertex(node.from) && onVertex(node.to) ? null : { nodes: [ref] };
  }
  const p = freePoint(state, ref[0]);
  const q = freePoint(state, ref[1]);
  return p && q ? { nodes: [...p.nodes, ...q.nodes] } : null;
}

/**
 * Déplace une position libre de `delta` : les nœuds qui la portent et leurs textes ancrés glissent
 * (animé, pendant `reveal`) ; les objets dessinés seuls exactement à cette place (le point O posé à
 * côté d'un centre donné en coordonnées, un trait tiré depuis O) suivent aussi.
 * `at` : les places d'origine de la position (un centre, ou les deux bouts d'un axe).
 */
export function moveFree(state: BoardState, nodes: readonly string[], at: readonly Vec2[], delta: Vec2, reveal: Reveal): BoardState {
  if (Math.hypot(delta[0], delta[1]) < EPS) return state;
  const moving = new Set(nodes);
  const ends: Array<{ id: string; from: boolean; to: boolean }> = [];
  for (const node of Object.values(state.nodes)) {
    if (!isVisible(node) || moving.has(node.id) || inGroup(state, node.id)) continue;
    if (node.type === "point" && at.some((p) => same(p, add(node.at, node.offset)))) moving.add(node.id);
    if (node.type === "segment" || node.type === "vector") {
      const from = at.some((p) => same(p, add(node.from, node.offset)));
      const to = at.some((p) => same(p, add(node.to, node.offset)));
      if (from && to) moving.add(node.id);
      else if (from || to) ends.push({ id: node.id, from, to });
    }
  }
  const ids = [...moving];
  let next = moveNodes(state, [...ids, ...anchoredTo(state, ids)], delta, reveal);
  // Un trait tiré depuis la position : seul ce bout-là suit (le trait se redessine).
  for (const end of ends) {
    next = updateNodes(next, [end.id], (node) =>
      node.type === "segment" || node.type === "vector"
        ? { ...node, from: end.from ? add(node.from, delta) : node.from, to: end.to ? add(node.to, delta) : node.to, labelAt: undefined, morph: reveal }
        : node,
    );
  }
  return next;
}
