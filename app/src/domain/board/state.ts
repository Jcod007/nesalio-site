/**
 * Le graphe de scène : la représentation abstraite de ce qui est au tableau.
 *
 * C'est la source de vérité. Le rendu (Manim) ne fait que la projeter à
 * l'écran, et le modèle en reçoit un résumé pour s'appuyer sur ce qui est
 * déjà dessiné. Elle contient :
 * - des nœuds (courbe, point, vecteur, segment, texte), chacun avec son
 *   horaire d'apparition, son déplacement cumulé, sa dernière transformation
 *   et son estompage ;
 * - des groupes (« le triangle » = trois segments et l'angle), qu'on cible
 *   comme un seul objet ;
 * - des relations : un texte peut être ancré à un objet (« à droite de A ») et
 *   le suit quand il bouge ou disparaît ;
 * - la pile de calculs, écrite sur le tableau à côté de la figure.
 *
 * Tout est pur et sérialisable : (état, commande, horaire) → nouvel état. Les
 * commandes elles-mêmes vivent dans `domain/scene/commands`.
 */
import type { ColorName, Side, TextSize } from "@/domain/scene/primitives";

export type Vec2 = [number, number];

export interface Reveal {
  /** Heure de début, en millisecondes sur l'horloge du lecteur. */
  start: number;
  duration: number;
}

export interface Frame {
  x: [number, number];
  y: [number, number];
  xLabel?: string;
  yLabel?: string;
}

/** Cadre utilisé tant que le modèle n'a pas tracé d'axes. */
export const DEFAULT_FRAME: Frame = { x: [-6, 6], y: [-4, 4] };

/** Déplacement animé d'un nœud : de `from` à `to` (déplacements cumulés, coordonnées mathématiques). */
export interface Motion {
  from: Vec2;
  to: Vec2;
  start: number;
  duration: number;
}

interface NodeBase {
  id: string;
  reveal: Reveal;
  erased?: Reveal;
  color?: ColorName;
  /** Déplacement cumulé depuis la position dessinée (coordonnées mathématiques). */
  offset: Vec2;
  /** Dernier déplacement, à animer. */
  motion?: Motion;
  /** Dernière transformation (le nœud a changé de forme ou de texte). */
  morph?: Reveal;
  /** Estompé (contexte) ou rendu à pleine intensité. */
  dim?: Reveal & { on: boolean };
}

export type CurveNode = NodeBase & {
  type: "curve";
  fn: string;
  from?: number;
  to?: number;
  style?: "solid" | "dashed" | "dotted";
  label?: string;
};
export type PointNode = NodeBase & { type: "point"; at: Vec2; label?: string; ring?: boolean };
export type VectorNode = NodeBase & { type: "vector"; from: Vec2; to: Vec2; label?: string };
export type SegmentNode = NodeBase & { type: "segment"; from: Vec2; to: Vec2; label?: string; dashed?: boolean };
export type TextNode = NodeBase & {
  type: "text";
  text: string;
  /** Centre du texte, ou son bord gauche (au milieu de la hauteur) si `align` vaut « left ». */
  at: Vec2;
  align: "center" | "left";
  size: TextSize;
  /** « calc » : ligne de la pile de calculs ; « free » : texte posé dans la figure. */
  role: "free" | "calc";
  /** Relation : le texte accompagne cet objet (il le suit et disparaît avec lui). */
  anchor?: { target: string; side: Side };
};
export type BoardNode = CurveNode | PointNode | VectorNode | SegmentNode | TextNode;
export type NodeType = BoardNode["type"];

export interface Group {
  id: string;
  members: readonly string[];
}

export interface AxesItem {
  frame: Frame;
  reveal: Reveal;
}

export interface TagItem {
  text: string;
  tone: "warn" | "ok" | "info";
  reveal: Reveal;
}

export type CameraTarget =
  | { kind: "fit"; x: [number, number]; y: [number, number]; at: number; duration: number }
  | { kind: "reset"; at: number; duration: number };

export interface BoardState {
  frame: Frame;
  axes: AxesItem | null;
  /** Le repère a été effacé (commande clear) : le rendu le fait disparaître. */
  axesCleared: Reveal | null;
  nodes: Readonly<Record<string, BoardNode>>;
  /** Ordre de dessin (les derniers par-dessus). */
  order: readonly string[];
  groups: Readonly<Record<string, Group>>;
  /** Lignes de la pile de calculs, de la plus ancienne à la plus récente. */
  calc: readonly string[];
  tag: TagItem | null;
  /** Heure de début de la dernière mise en évidence de chaque nœud. */
  highlights: Readonly<Record<string, number>>;
  camera: CameraTarget | null;
  /** Compteur pour les identifiants automatiques. */
  seq: number;
}

export function emptyBoard(): BoardState {
  return {
    frame: DEFAULT_FRAME,
    axes: null,
    axesCleared: null,
    nodes: {},
    order: [],
    groups: {},
    calc: [],
    tag: null,
    highlights: {},
    camera: null,
    seq: 0,
  };
}

/* ------------------------------- lecture ------------------------------- */

export function isVisible(node: BoardNode | undefined): node is BoardNode {
  return node !== undefined && node.erased === undefined;
}

export function visibleNodes(state: BoardState): BoardNode[] {
  return state.order.map((id) => state.nodes[id]).filter(isVisible);
}

/** Nœuds visés par un identifiant : le nœud lui-même, ou les membres d'un groupe. */
export function resolveTargets(state: BoardState, id: string): string[] {
  if (isVisible(state.nodes[id])) return [id];
  const group = state.groups[id];
  if (!group) return [];
  return group.members.filter((member) => isVisible(state.nodes[member]));
}

/** Textes ancrés à l'un des nœuds donnés, directement ou via un groupe (ils les accompagnent). */
export function anchoredTo(state: BoardState, ids: readonly string[]): string[] {
  const set = new Set(ids);
  const follows = (target: string) => set.has(target) || (state.groups[target]?.members.some((m) => set.has(m)) ?? false);
  return visibleNodes(state)
    .filter((node) => node.type === "text" && node.anchor !== undefined && !set.has(node.id) && follows(node.anchor.target))
    .map((node) => node.id);
}

/* ----------------------------- modification ----------------------------- */

/** Ajoute un nœud, ou remplace celui qui porte le même identifiant (sans changer l'ordre). */
export function putNode(state: BoardState, node: BoardNode): BoardState {
  const exists = node.id in state.nodes;
  return {
    ...state,
    nodes: { ...state.nodes, [node.id]: node },
    order: exists ? state.order : [...state.order, node.id],
  };
}

export function updateNodes(state: BoardState, ids: readonly string[], update: (node: BoardNode) => BoardNode): BoardState {
  if (ids.length === 0) return state;
  const nodes = { ...state.nodes };
  for (const id of ids) {
    const node = nodes[id];
    if (node) nodes[id] = update(node);
  }
  return { ...state, nodes };
}

/** Déplace des nœuds de `delta` (coordonnées mathématiques), avec animation. */
export function moveNodes(state: BoardState, ids: readonly string[], delta: Vec2, reveal: Reveal): BoardState {
  if (ids.length === 0 || (delta[0] === 0 && delta[1] === 0)) return state;
  return updateNodes(state, ids, (node) => {
    const to: Vec2 = [node.offset[0] + delta[0], node.offset[1] + delta[1]];
    return { ...node, offset: to, motion: { from: node.offset, to, start: reveal.start, duration: reveal.duration } };
  });
}

/** Retire définitivement les nœuds effacés dont l'animation de sortie est terminée. */
export function pruneErased(state: BoardState, now: number): BoardState {
  const gone = state.order.filter((id) => {
    const erased = state.nodes[id]?.erased;
    return erased !== undefined && now >= erased.start + erased.duration;
  });
  if (gone.length === 0) return state;
  const goneSet = new Set(gone);
  const nodes = { ...state.nodes };
  for (const id of gone) delete nodes[id];
  const groups: Record<string, Group> = {};
  for (const group of Object.values(state.groups)) {
    const members = group.members.filter((m) => !goneSet.has(m));
    if (members.length > 0) groups[group.id] = { ...group, members };
  }
  return {
    ...state,
    nodes,
    groups,
    order: state.order.filter((id) => !goneSet.has(id)),
    calc: state.calc.filter((id) => !goneSet.has(id)),
  };
}

/* ------------------------------- résumé ------------------------------- */

/** Description courte d'un objet, envoyée au modèle pour qu'il s'appuie sur le tableau. */
export interface BoardSummaryItem {
  id: string;
  type: string;
  detail: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const pt = ([x, y]: Vec2) => `(${fmt(x)}, ${fmt(y)})`;
const shifted = ([x, y]: Vec2, [dx, dy]: Vec2): Vec2 => [x + dx, y + dy];

export function summarizeBoard(state: BoardState): BoardSummaryItem[] {
  const out: BoardSummaryItem[] = [];
  if (state.axes) {
    const { x, y } = state.axes.frame;
    out.push({ id: "axes", type: "axes", detail: `x de ${fmt(x[0])} à ${fmt(x[1])}, y de ${fmt(y[0])} à ${fmt(y[1])}` });
  }
  for (const node of visibleNodes(state)) {
    const type = node.type === "text" && node.role === "calc" ? "note" : node.type;
    out.push({ id: node.id, type, detail: (describeNode(node) + (node.dim?.on ? " (estompé)" : "")).slice(0, 160) });
  }
  for (const group of Object.values(state.groups)) {
    const members = group.members.filter((m) => isVisible(state.nodes[m]));
    if (members.length > 0) out.push({ id: group.id, type: "group", detail: members.join(", ").slice(0, 160) });
  }
  return out;
}

function describeNode(node: BoardNode): string {
  switch (node.type) {
    case "curve":
      return `y = ${node.fn}${node.label ? ` (« ${node.label} »)` : ""}`;
    case "point":
      return `${pt(shifted(node.at, node.offset))}${node.label ? ` « ${node.label} »` : ""}`;
    case "vector":
    case "segment":
      return `de ${pt(shifted(node.from, node.offset))} à ${pt(shifted(node.to, node.offset))}${node.label ? ` « ${node.label} »` : ""}`;
    case "text":
      if (node.role === "calc") return node.text;
      return `« ${node.text} »${node.anchor ? ` (${sideWord[node.anchor.side]} ${node.anchor.target})` : ` en ${pt(shifted(node.at, node.offset))}`}`;
  }
}

const sideWord: Record<Side, string> = { above: "au-dessus de", below: "sous", left: "à gauche de", right: "à droite de" };
