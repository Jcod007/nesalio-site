/**
 * Mesure des chevauchements au tableau, sur les empreintes du moteur
 * (layout.ts : les mêmes boîtes, traits et surfaces que ceux qu'il évite).
 * Sert à l'outil d'analyse des séances et aux tests.
 *
 * Un texte (texte libre, ligne de calcul, étiquette d'objet, chiffre de
 * graduation) est gêné quand il est posé :
 * - « texte » : sur un autre texte (plus de 20 % de la plus petite boîte) ;
 * - « point » : sur la pastille d'un point (plus de 30 % de la pastille) ;
 * - « trait » : barré par le trait d'un autre objet (courbe, segment, contour, axe) ;
 * - « surface » : dans un polygone rempli d'un autre objet (30 % de la boîte ou plus),
 *   sauf s'il recouvre déjà ce que le texte nomme (l'étiquette d'un côté sous un carré) ;
 * et « graduations » : deux chiffres d'un même axe qui se touchent.
 *
 * Deux dessins se gênent aussi (« dessins ») : deux surfaces fermées (polygone, cercle, secteur)
 * de figures différentes qui se recouvrent en partie, de 10 % à 90 % de la plus petite ; un
 * carré posé sur un côté (bord commun) ou une partie coloriée dans sa figure ne comptent pas.
 * Vu le 19 octobre : un exemple dessiné par-dessus le carré de l'hypoténuse.
 */
import { AXES_OWNER, footprints, intersects, namingRegions, regionCover, tickLabels, type Box } from "./layout";
import { add, insidePolygon } from "./shapes";
import { isVisible, visibleNodes, type BoardNode, type BoardState, type Vec2 } from "./state";

export type CollisionKind = "texte" | "point" | "trait" | "surface" | "graduations" | "dessins";
export interface Collision {
  a: string;
  b: string;
  kind: CollisionKind;
  ratio: number;
}

const area = (b: Box) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
const overlap = (a: Box, b: Box) =>
  area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
const shrink = (b: Box, k: number): Box => {
  const dx = ((b.x1 - b.x0) * k) / 2;
  const dy = ((b.y1 - b.y0) * k) / 2;
  return { x0: b.x0 + dx, x1: b.x1 - dx, y0: b.y0 + dy, y1: b.y1 - dy };
};
const round = (x: number) => Math.round(x * 100) / 100;

/** Nom lisible d'un morceau : l'objet, et « (étiquette) » pour l'étiquette d'un objet. */
const name = (owner: string, part: string) => (part === "label" && owner !== AXES_OWNER ? `${owner}·étiquette` : owner);

export function collisions(state: BoardState): Collision[] {
  const prints = footprints(state);
  const texts = prints.boxes.filter((b) => b.part === "body" || b.part === "label");
  const dots = prints.boxes.filter((b) => b.part === "dot");
  const out: Collision[] = [];

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]!;
    const tName = name(t.owner, t.part);
    const ticks = t.owner === AXES_OWNER;
    // Texte sur texte (les chiffres des graduations entre eux sont comptés à part).
    for (let j = i + 1; j < texts.length; j++) {
      const u = texts[j]!;
      if (u.owner === t.owner) continue;
      const ratio = overlap(t.box, u.box) / Math.min(area(t.box), area(u.box) || 1);
      if (ratio > 0.2) out.push({ a: tName, b: name(u.owner, u.part), kind: "texte", ratio: round(ratio) });
    }
    if (ticks) continue; // les chiffres des axes : seulement face aux autres textes
    for (const d of dots) {
      if (d.owner === t.owner) continue;
      const ratio = overlap(t.box, d.box) / (area(d.box) || 1);
      if (ratio > 0.3) out.push({ a: tName, b: d.owner, kind: "point", ratio: round(ratio) });
    }
    const inner = shrink(t.box, 0.2);
    for (const s of prints.strokes) {
      if (s.owner === t.owner) continue;
      const hits = s.points.filter(([x, y]) => x > inner.x0 && x < inner.x1 && y > inner.y0 && y < inner.y1).length;
      if (hits >= 2) out.push({ a: tName, b: s.owner, kind: "trait", ratio: hits });
    }
    const allowed = namingRegions(state, t.owner);
    for (const r of prints.regions) {
      if (r.owner === t.owner || allowed.has(r.owner)) continue;
      const ratio = regionCover(t.box, r.points);
      if (ratio >= 0.3) out.push({ a: tName, b: r.owner, kind: "surface", ratio: round(ratio) });
    }
  }

  // Graduations : deux chiffres voisins d'un même axe qui se touchent.
  if (state.axes) {
    const labels = tickLabels(state.axes.frame);
    for (const axis of ["x", "y"] as const) {
      const row = labels.filter((l) => l.axis === axis).map((l) => ({ x0: l.at[0] - l.size.w / 2, x1: l.at[0] + l.size.w / 2, y0: l.at[1] - l.size.h / 2, y1: l.at[1] + l.size.h / 2 }));
      const touching = row.filter((b, k) => k > 0 && intersects(row[k - 1]!, b)).length;
      if (touching > 0) out.push({ a: `${AXES_OWNER}-${axis}`, b: `${AXES_OWNER}-${axis}`, kind: "graduations", ratio: touching });
    }
  }
  out.push(...shapeOverlaps(state));
  return out;
}

/**
 * Le contour d'une figure du tableau (nœud ou groupe), ou null : une surface fermée (polygone,
 * cercle), ou les sommets ordonnés d'une figure tracée côté par côté (@0, @1, @2 d'un triangle).
 */
export function figureOutline(state: BoardState, id: string): Vec2[] | null {
  const group = state.groups[id];
  const ids = state.nodes[id] ? [id] : (group?.members ?? []);
  for (const member of ids) {
    const node = state.nodes[member];
    const ring = isVisible(node) ? outline(node) : null;
    if (ring) return ring;
  }
  return orderedOutline(state, id);
}

/**
 * Les surfaces fermées du tableau : les nœuds (polygone fermé, cercle) et les figures tracées
 * côté par côté (un triangle, par ses sommets ordonnés). `filled` : une surface coloriée, ou
 * une figure (on ne pose pas une figure à moitié sur une autre) ; deux cercles vides d'un
 * diagramme, eux, se recouvrent exprès. Partagé par la détection des chevauchements et par
 * le moteur qui fait de la place (room).
 */
export function closedShapes(state: BoardState): Array<{ id: string; poly: Vec2[]; filled: boolean }> {
  const nodes = visibleNodes(state).flatMap((node) => {
    const poly = outline(node);
    return poly ? [{ id: node.id, poly, filled: node.type === "polygon" && (node.fill === true || node.shade === true) }] : [];
  });
  const figures = Object.keys(state.groups).flatMap((id) => {
    const poly = orderedOutline(state, id);
    return poly ? [{ id, poly, filled: true }] : [];
  });
  return [...nodes, ...figures];
}

/** Les sommets ordonnés d'un groupe (@0, @1…), à leur place, s'il en a au moins trois et qu'il est visible. */
function orderedOutline(state: BoardState, id: string): Vec2[] | null {
  const group = state.groups[id];
  const shown = group?.members.map((member) => state.nodes[member]).find(isVisible);
  const ordered = Array.from({ length: 12 }, (_, i) => group?.vertices?.[`@${i}`]).filter((p): p is Vec2 => p !== undefined);
  return shown && ordered.length >= 3 ? ordered.map((p) => add(p, shown.offset)) : null;
}

/** Contour d'une surface fermée, à sa place (décalage compris), ou null. */
export function outline(node: BoardNode): Vec2[] | null {
  const [dx, dy] = node.offset;
  if (node.type === "polygon" && node.closed && node.points.length >= 3) return node.points.map(([x, y]) => [x + dx, y + dy] as Vec2);
  if (node.type === "circle") {
    return Array.from({ length: 40 }, (_, i) => {
      const t = (2 * Math.PI * i) / 40;
      return [node.center[0] + dx + node.radius * Math.cos(t), node.center[1] + dy + node.radius * Math.sin(t)] as Vec2;
    });
  }
  return null;
}

export const bounds = (poly: Vec2[]): Box => ({
  x0: Math.min(...poly.map((p) => p[0])),
  y0: Math.min(...poly.map((p) => p[1])),
  x1: Math.max(...poly.map((p) => p[0])),
  y1: Math.max(...poly.map((p) => p[1])),
});

/** Part de la surface `small` recouverte par `big` (échantillonnage sur une grille). */
export function covered(small: Vec2[], big: Vec2[]): number {
  const b = bounds(small);
  const n = 24;
  let inSmall = 0;
  let inBoth = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p: Vec2 = [b.x0 + ((i + 0.5) * (b.x1 - b.x0)) / n, b.y0 + ((j + 0.5) * (b.y1 - b.y0)) / n];
      if (!insidePolygon(p, small)) continue;
      inSmall++;
      if (insidePolygon(p, big)) inBoth++;
    }
  }
  return inSmall === 0 ? 0 : inBoth / inSmall;
}

function shapeOverlaps(state: BoardState): Collision[] {
  const shapes = closedShapes(state);
  // Deux parties d'une même figure (un groupe), ou une figure et l'une de ses parties, se touchent exprès.
  const together = (a: string, b: string) =>
    state.groups[a]?.members.includes(b) || state.groups[b]?.members.includes(a) || Object.values(state.groups).some((g) => g.members.includes(a) && g.members.includes(b));
  const out: Collision[] = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i]!;
      const b = shapes[j]!;
      if (together(a.id, b.id) || !intersects(bounds(a.poly), bounds(b.poly))) continue;
      const [small, big] = area(bounds(a.poly)) <= area(bounds(b.poly)) ? [a, b] : [b, a];
      const ratio = covered(small.poly, big.poly);
      if (ratio >= 0.1 && ratio <= 0.9) out.push({ a: small.id, b: big.id, kind: "dessins", ratio: round(ratio) });
    }
  }
  return out;
}
