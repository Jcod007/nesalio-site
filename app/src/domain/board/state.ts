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

/** Rotation animée d'un nœud autour d'un point (degrés, sens trigonométrique). */
export interface Spin {
  about: Vec2;
  angle: number;
  start: number;
  duration: number;
}

/** Matrice 2×2, en lignes : [[a, b], [c, d]]. */
export type Mat2 = [[number, number], [number, number]];
export const IDENTITY: Mat2 = [
  [1, 0],
  [0, 1],
];
export const applyMat = (m: Mat2, [x, y]: Vec2): Vec2 => [m[0][0] * x + m[0][1] * y, m[1][0] * x + m[1][1] * y];
export const mulMat = (a: Mat2, b: Mat2): Mat2 => [
  [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
  [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
];

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
  /**
   * Déplacements à animer, dans l'ordre (les plus récents). Plusieurs par étape
   * sont possibles : « on le déplace, puis on le ramène ».
   */
  motions?: Motion[];
  /** Rotations à animer, dans l'ordre (le pendule qui oscille, un vecteur qui tourne). */
  spins?: Spin[];
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
  /** Centre de l'étiquette, choisi par le moteur pour ne rien chevaucher. */
  labelAt?: Vec2;
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
  /** Matrice ou vecteur colonne : les cases, ligne par ligne (le texte sert alors de résumé). */
  rows?: string[][];
};
/** Arc de cercle (marque d'angle, par exemple). Angles en degrés, sens trigonométrique. */
export type ArcNode = NodeBase & { type: "arc"; center: Vec2; radius: number; start: number; end: number; label?: string };
export type CircleNode = NodeBase & { type: "circle"; center: Vec2; radius: number; dashed?: boolean; label?: string };
/** Courbe paramétrée : x(t) et y(t), t de t[0] à t[1]. Dessinée comme une ligne brisée fine. */
export interface Parametric {
  x: string;
  y: string;
  t: [number, number];
}
/** Polygone ou ligne brisée (`closed: false`), éventuellement rempli. */
export type PolygonNode = NodeBase & {
  type: "polygon";
  points: Vec2[];
  closed: boolean;
  fill?: boolean;
  /** Remplissage plus marqué (une aire sous une courbe). */
  shade?: boolean;
  label?: string;
  /** Si le polygone vient d'une courbe paramétrée : ses équations (pour la transformer). */
  param?: Parametric;
};
/** Quadrillage du plan, déformé par une matrice (transformations linéaires). */
export type GridNode = NodeBase & { type: "grid"; x: [number, number]; y: [number, number]; matrix: Mat2 };
export type BoardNode = CurveNode | PointNode | VectorNode | SegmentNode | TextNode | ArcNode | CircleNode | PolygonNode | GridNode;
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

/** Nombre de déplacements gardés par nœud : assez pour une étape, sans faire grossir l'état. */
const MOTION_HISTORY = 8;

/** Dernier déplacement d'un nœud, s'il en a un. */
export function lastMotion(node: BoardNode): Motion | undefined {
  return node.motions?.at(-1);
}

/**
 * Déplace des nœuds de `delta` (coordonnées mathématiques), avec animation.
 * Le déplacement s'ajoute aux précédents : deux déplacements dans la même
 * étape s'enchaînent au lieu de s'écraser.
 */
export function moveNodes(state: BoardState, ids: readonly string[], delta: Vec2, reveal: Reveal): BoardState {
  if (ids.length === 0 || (delta[0] === 0 && delta[1] === 0)) return state;
  return updateNodes(state, ids, (node) => {
    const to: Vec2 = [node.offset[0] + delta[0], node.offset[1] + delta[1]];
    const motion: Motion = { from: node.offset, to, start: reveal.start, duration: reveal.duration };
    return { ...node, offset: to, motions: [...(node.motions ?? []), motion].slice(-MOTION_HISTORY) };
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
    case "arc":
      return `angle de ${fmt(node.end - node.start)}° en ${pt(shifted(node.center, node.offset))}${node.label ? ` « ${node.label} »` : ""}`;
    case "circle":
      return `centre ${pt(shifted(node.center, node.offset))}, rayon ${fmt(node.radius)}${node.label ? ` « ${node.label} »` : ""}`;
    case "polygon": {
      const label = node.label ? ` « ${node.label} »` : "";
      // Le modèle doit pouvoir reprendre une courbe paramétrée par ses équations (pour la transformer).
      if (node.param) return `courbe paramétrée x(t) = ${node.param.x}, y(t) = ${node.param.y}, t de ${fmt(node.param.t[0])} à ${fmt(node.param.t[1])}${label}`;
      if (node.shade) return `aire colorée de x = ${fmt(Math.min(...node.points.map((p) => p[0])))} à ${fmt(Math.max(...node.points.map((p) => p[0])))}`;
      if (node.points.length > 10) return `ligne de ${node.points.length} points${label}`;
      return `${node.points.map((p) => pt(shifted(p, node.offset))).join(" ")}${label}`;
    }
    case "grid":
      return `quadrillage, matrice appliquée [[${node.matrix[0].map(fmt).join(", ")}], [${node.matrix[1].map(fmt).join(", ")}]]`;
    case "text":
      if (node.role === "calc") return node.text;
      return `« ${node.text} »${node.anchor ? ` (${sideWord[node.anchor.side]} ${node.anchor.target})` : ` en ${pt(shifted(node.at, node.offset))}`}`;
  }
}

const sideWord: Record<Side, string> = { above: "au-dessus de", below: "sous", left: "à gauche de", right: "à droite de" };
