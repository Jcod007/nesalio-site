/**
 * Encombrement du tableau : l'empreinte de ce qui y est déjà (boîtes, traits,
 * surfaces) et la mesure de ce qui gênerait une boîte qu'on voudrait poser.
 */
import { sampleCurve } from "../geometry";
import { insidePolygon } from "../shapes";
import { visibleNodes, type BoardState, type Frame, type Vec2 } from "../state";
import { boxAround, intersects, sampleLine, shift } from "./boxes";
import { mathSize, scales, type Box } from "./measure";
import { hasLabel, labelBox, nodeBox, outline } from "./nodeBoxes";
import { axisTicks, tickLabels } from "./ticks";

/* -------------------------------- empreintes -------------------------------- */

/**
 * L'empreinte de ce qui est au tableau : ce que chaque objet occupe.
 * - boîtes : textes, étiquettes, pastilles des points, chiffres des graduations ;
 * - traits : courbes, segments, vecteurs, contours (points échantillonnés) ;
 * - surfaces : polygones remplis (un carré construit sur un côté, le bloc d'un plan incliné).
 * Chaque morceau est rattaché à son objet (`owner`) et à sa partie, pour qu'un
 * objet puisse ignorer sa propre étiquette ou sa propre surface.
 */
export type Part = "body" | "label" | "dot" | "stroke" | "region";
export interface Footprints {
  boxes: Array<{ owner: string; part: Part; box: Box; text?: string }>;
  strokes: Array<{ owner: string; points: Vec2[] }>;
  regions: Array<{ owner: string; points: Vec2[] }>;
}

/** Identifiant de l'empreinte du repère (axes et graduations). */
export const AXES_OWNER = "axes";

/** Échantillonne un trait à peu près tous les 0,1 unité du monde. */
function strokeSamples(frame: Frame, a: Vec2, b: Vec2): Vec2[] {
  const s = scales(frame);
  const n = Math.max(2, Math.min(200, Math.ceil(Math.hypot((b[0] - a[0]) * s.x, (b[1] - a[1]) * s.y) / 0.1)));
  return sampleLine(a, b, n);
}

/** `skip(owner, part)` : morceaux à ne pas compter (l'objet qu'on place, sa cible…). */
export function footprints(state: BoardState, skip: (owner: string, part: Part) => boolean = () => false): Footprints {
  const frame = state.frame;
  const out: Footprints = { boxes: [], strokes: [], regions: [] };
  const box = (owner: string, part: Part, b: Box | null, text?: string) => {
    if (b && !skip(owner, part)) out.boxes.push({ owner, part, box: b, text });
  };
  const stroke = (owner: string, points: Vec2[]) => {
    if (points.length > 0 && !skip(owner, "stroke")) out.strokes.push({ owner, points });
  };
  for (const node of visibleNodes(state)) {
    const move = ([x, y]: Vec2): Vec2 => [x + node.offset[0], y + node.offset[1]];
    switch (node.type) {
      case "grid":
        continue; // le quadrillage est un fond
      case "text":
        box(node.id, "body", nodeBox(node, frame), node.text);
        continue;
      case "point":
        box(node.id, "dot", shift(boxAround(node.at, mathSize(frame, 0.3, 0.3)), node.offset));
        break;
      case "curve":
        for (const piece of sampleCurve(node.fn, frame, node.from, node.to, 160)) stroke(node.id, piece.map(move));
        break;
      case "segment":
      case "vector":
        stroke(node.id, strokeSamples(frame, node.from, node.to).map(move));
        break;
      default: {
        const ring = outline(node);
        stroke(node.id, ring.flatMap((p, i) => (i === 0 ? [] : strokeSamples(frame, ring[i - 1]!, p).slice(1))).map(move));
        if (node.type === "polygon" && node.fill && !node.shade && node.closed && !skip(node.id, "region")) {
          out.regions.push({ owner: node.id, points: node.points.map(move) });
        }
      }
    }
    if (hasLabel(node)) box(node.id, "label", labelBox(node, frame), node.label);
  }
  if (state.axes) {
    const { x, y } = state.axes.frame;
    const { origin } = axisTicks(state.axes.frame);
    stroke(AXES_OWNER, strokeSamples(frame, [x[0], origin[1]], [x[1], origin[1]]));
    stroke(AXES_OWNER, strokeSamples(frame, [origin[0], y[0]], [origin[0], y[1]]));
    for (const tick of tickLabels(state.axes.frame)) box(AXES_OWNER, "label", boxAround(tick.at, tick.size), tick.text);
  }
  return out;
}

/** Part d'une boîte recouverte par un polygone (grille de 5 × 3 points). */
export function regionCover(box: Box, polygon: readonly Vec2[]): number {
  let hits = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      const p: Vec2 = [box.x0 + ((box.x1 - box.x0) * (i + 0.5)) / 5, box.y0 + ((box.y1 - box.y0) * (j + 0.5)) / 3];
      if (insidePolygon(p, polygon)) hits++;
    }
  }
  return hits / 15;
}

const inside = ([x, y]: Vec2, b: Box) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;

/** En dessous de ce score, une place est libre. */
export const FREE = 0.02;

/**
 * Mesure de l'encombrement d'une zone (0 = libre), sur les empreintes de ce qui
 * est au tableau : boîtes recouvertes (textes, étiquettes, pastilles des
 * points, chiffres des axes), traits qui la traversent, surfaces remplies.
 * `ignore` : objets à ne pas compter du tout ; `skip` : morceaux précis à ne
 * pas compter (l'étiquette ou la surface d'un objet qui place sa propre étiquette).
 */
export function obstacles(state: BoardState, ignore: ReadonlySet<string>, skip?: (owner: string, part: Part) => boolean): (box: Box) => number {
  return crowding(footprints(state, (owner, part) => ignore.has(owner) || (skip?.(owner, part) ?? false)));
}

/** Encombrement d'une boîte par des empreintes données. */
export function crowding(prints: Footprints): (box: Box) => number {
  return (box) => {
    const area = (box.x1 - box.x0) * (box.y1 - box.y0) || 1;
    let score = 0;
    for (const { box: b } of prints.boxes) {
      if (!intersects(b, box)) continue;
      // Part recouverte de la plus petite des deux boîtes : un chiffre entièrement caché sous un long texte compte plein.
      const inter = (Math.min(b.x1, box.x1) - Math.max(b.x0, box.x0)) * (Math.min(b.y1, box.y1) - Math.max(b.y0, box.y0));
      score += inter / Math.min(area, (b.x1 - b.x0) * (b.y1 - b.y0) || area);
    }
    for (const { points } of prints.strokes) for (const p of points) if (inside(p, box)) score += 0.05;
    for (const { points } of prints.regions) score += regionCover(box, points);
    return score;
  };
}

/** La boîte, agrandie d'un petit blanc tout autour (unités du monde) : deux textes ne se collent pas. */
export function padded(frame: Frame, box: Box, margin = 0.06): Box {
  const pad = mathSize(frame, margin, margin);
  return { x0: box.x0 - pad.w, x1: box.x1 + pad.w, y0: box.y0 - pad.h, y1: box.y1 + pad.h };
}
