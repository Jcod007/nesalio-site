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
 */
import { AXES_OWNER, footprints, intersects, namingRegions, regionCover, tickLabels, type Box } from "./layout";
import type { BoardState } from "./state";

export type CollisionKind = "texte" | "point" | "trait" | "surface" | "graduations";
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
  return out;
}
