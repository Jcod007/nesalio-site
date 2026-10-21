/**
 * Figures paramétriques : l'IA décrit la figure par ses paramètres
 * (« triangle rectangle d'angle 30° et d'hypoténuse 5 », « plan incliné à
 * 25° avec le poids décomposé »), le moteur calcule une géométrie exacte.
 *
 * Une figure composée crée des sous-objets nommés `<id>-<partie>` (côtés,
 * angle, bloc, forces…) réunis dans un groupe `<id>` : on peut ensuite mettre
 * en évidence l'hypoténuse, estomper le bloc ou déplacer toute la figure.
 */
import { z } from "zod";
import { fitFrame, worldPerMath, type Box } from "@/domain/board/layout";
import { outline } from "@/domain/board/collisions";
import { roomFor } from "@/domain/board/room";
import {
  add,
  angleArc,
  arcPoints,
  centroid,
  outward,
  rightAngleMark,
  rotate,
  scale,
  solveRightTriangle,
  solveTriangle,
  sub,
  rad,
} from "@/domain/board/shapes";
import { isVisible, moveNodes, putNode, type BoardNode, type BoardState, type Group, type Reveal, type TextNode, type Vec2 } from "@/domain/board/state";
import { ColorName, Coord, finite, Id } from "../primitives";
import { base, drawNode } from "./figure";
import { defineCommand } from "./define";
import { PointRef, resolvePoint } from "./points";

type Color = z.infer<typeof ColorName>;

/** Identifiant de figure composée : assez court pour laisser la place aux suffixes. */
const ShapeId = Id.refine((id) => id.length <= 24, { message: "Identifiant de figure : 24 caractères au plus" });
const Name = z.string().trim().min(1).max(24);

/** Boîte englobante de quelques points (coordonnées mathématiques). */
function pointsBox(points: Vec2[]): Box {
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
function drawFigure(
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
function label(id: string, text: string, at: Vec2, target: string, reveal: Reveal, color?: Color): TextNode {
  return { ...base(id, reveal, color), type: "text", text, at, align: "center", size: "normal", role: "free", anchor: { target, side: "above" } };
}

const segment = (id: string, from: Vec2, to: Vec2, reveal: Reveal, color?: Color, dashed?: boolean): BoardNode => ({
  ...base(id, reveal, color),
  type: "segment",
  from,
  to,
  dashed,
});

const vector = (id: string, from: Vec2, to: Vec2, text: string, reveal: Reveal, color: Color): BoardNode => ({
  ...base(id, reveal, color),
  type: "vector",
  from,
  to,
  label: text,
});

/** Marque d'angle : arc avec étiquette, ou petit carré pour un angle droit. */
function angleMark(state: BoardState, id: string, vertex: Vec2, a: Vec2, b: Vec2, text: string | undefined, right: boolean, reveal: Reveal, color?: Color): BoardNode {
  const unit = worldPerMath(state.frame);
  if (right) {
    return { ...base(id, reveal, color ?? "muted"), type: "polygon", points: rightAngleMark(vertex, a, b, 0.24 / unit), closed: false, label: text };
  }
  const { start, end } = angleArc(vertex, a, b);
  return { ...base(id, reveal, color ?? "violet"), type: "arc", center: vertex, radius: 0.5 / unit, start, end, label: text };
}

/* --------------------------------- formes --------------------------------- */

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

export const circleCommand = defineCommand({
  schema: z.object({
    type: z.literal("circle"),
    id: Id,
    center: PointRef,
    radius: finite.positive().max(10_000),
    dashed: z.boolean().optional(),
    label: z.string().max(24).optional(),
    color: ColorName.optional(),
  }),
  doc: '{"type":"circle","id":"c","center":[0,0],"radius":1,"label":"cercle trigonométrique","dashed":false}',
  duration: 1200,
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    const center = resolvePoint(state, action.center);
    if (!center) return state;
    // Centré sur un point nommé : le cercle tient à ce point, il ne se déplace pas.
    const node = { ...base(id, reveal, color), type, ...rest, center } as BoardNode;
    return drawNode(state, typeof action.center === "string" ? node : withRoom(state, node), reveal);
  },
});

export const polygonCommand = defineCommand({
  schema: z.object({
    type: z.literal("polygon"),
    id: Id,
    points: z.array(PointRef).min(3).max(10),
    fill: z.boolean().optional(),
    label: z.string().max(24).optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"polygon","id":"p","points":[[0,0],[4,0],[4,3]],"fill":true,"label":"…"} : polygone fermé (rempli si "fill").\n' +
    '  Les sommets peuvent être nommés : "points":["A","B","H"] (un petit triangle dans la figure, exact).',
  duration: 1200,
  apply(state, action, reveal) {
    const { type, id, color, ...rest } = action;
    const points = action.points.map((ref) => resolvePoint(state, ref));
    if (points.some((p) => p === null)) return state;
    // Sommets nommés (« le triangle ABH ») : la figure tient à ces points, elle ne se déplace pas.
    const named = action.points.some((ref) => typeof ref === "string");
    const node = { ...base(id, reveal, color), type, ...rest, points: points as Vec2[], closed: true } as BoardNode;
    return drawNode(state, named ? node : withRoom(state, node), reveal);
  },
});

export const angleCommand = defineCommand({
  schema: z.object({
    type: z.literal("angle"),
    id: Id,
    at: PointRef,
    from: PointRef,
    to: PointRef,
    label: z.string().max(12).optional(),
    right: z.boolean().optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"angle","id":"t","at":"A","from":"B","to":"C","label":"θ"} : marque l\'angle en A entre AB et AC\n' +
    '  (points par leur nom ou [x,y] ; "right":true pour un angle droit).',
  duration: 700,
  apply(state, action, reveal) {
    const vertex = resolvePoint(state, action.at);
    const a = resolvePoint(state, action.from);
    const b = resolvePoint(state, action.to);
    if (!vertex || !a || !b) return state;
    return drawNode(state, angleMark(state, action.id, vertex, a, b, action.label, action.right ?? false, reveal, action.color), reveal);
  },
});

/* --------------------------------- secteur --------------------------------- */

export const sectorCommand = defineCommand({
  schema: z.object({
    type: z.literal("sector"),
    id: ShapeId,
    center: Coord,
    radius: finite.positive().max(10_000),
    from: finite.min(-720).max(720),
    to: finite.min(-720).max(720),
    label: z.string().max(24).optional(),
    arcLabel: z.string().max(24).optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"sector","id":"s","center":[0,0],"radius":5,"from":0,"to":60,"label":"60°","arcLabel":"arc ≈ 5,2"} : secteur\n' +
    '  de disque (une part de pizza) entre deux angles en degrés, avec ses deux rayons et son arc. Parties : s-surface\n' +
    '  (la part, remplie), s-arc (l\'arc seul, pour sa longueur), s-r1, s-r2 (les rayons). Un "rotate" sur "s" la fait\n' +
    '  tourner autour du centre ("about" = le centre) ; pour une fraction du cercle, dessine les parts une à une.',
  duration: 1400,
  aliases: ["wedge", "part"],
  apply(state, action, reveal) {
    const { center, radius, id } = action;
    const color = action.color ?? "orange";
    const [start, end] = action.from <= action.to ? [action.from, action.to] : [action.to, action.from];
    const samples = Math.max(8, Math.ceil((end - start) / 6));
    const arc = arcPoints(center, radius, start, end, samples);
    state = fitFrame(state, pointsBox([center, ...arc]));
    const unit = worldPerMath(state.frame);
    const middle = rad((start + end) / 2);
    const dir: Vec2 = [Math.cos(middle), Math.sin(middle)];
    const parts: BoardNode[] = [
      {
        ...base(`${id}-surface`, reveal, color),
        type: "polygon",
        points: [center, ...arc],
        closed: true,
        fill: true,
        label: action.label,
        // L'angle s'écrit dans la part, près du centre ; la longueur de l'arc, dehors.
        labelAt: add(center, scale(dir, Math.min(radius * 0.55, radius - 0.4 / unit))),
      },
      segment(`${id}-r1`, center, arc[0]!, reveal, color),
      segment(`${id}-r2`, center, arc[arc.length - 1]!, reveal, color),
      { ...base(`${id}-arc`, reveal, color), type: "polygon", points: arc, closed: false },
    ];
    if (action.arcLabel) parts.push(label(`${id}-arc-l`, action.arcLabel, add(center, scale(dir, radius + 0.45 / unit)), `${id}-arc`, reveal, color));
    return drawFigure(state, id, parts, reveal, {}, { [`${id}-centre`]: center });
  },
});

/* -------------------------------- cylindre -------------------------------- */

/** Ellipse d'un cercle vu en perspective (axe vertical) : de start à end degrés. */
function ellipse(center: Vec2, rx: number, ry: number, start: number, end: number, samples = 32): Vec2[] {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = rad(start + ((end - start) * i) / samples);
    return [center[0] + rx * Math.cos(t), center[1] + ry * Math.sin(t)] as Vec2;
  });
}

export const cylinderCommand = defineCommand({
  schema: z.object({
    type: z.literal("cylinder"),
    id: ShapeId,
    radius: finite.positive().max(10_000),
    height: finite.positive().max(10_000),
    at: Coord.optional(),
    slices: z.number().int().min(0).max(12).optional(),
    labels: z.object({ radius: Name, height: Name, base: Name }).partial().optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"cylinder","id":"cyl","radius":2,"height":3,"slices":4,"labels":{"radius":"r","height":"h","base":"aire de la base"}}\n' +
    '  Cylindre en perspective (centre de la base en "at", sinon centré) : base et dessus en ellipses, côtés, rayon et\n' +
    '  hauteur nommés. "slices" : la pile de tranches identiques (pièces de monnaie) qui montre V = aire de la base × h ;\n' +
    '  redemander la figure avec plus de tranches les ajoute. Parties : cyl-base, cyl-dessus (rempli : l\'aire de la base),\n' +
    '  cyl-cotes, cyl-rayon, cyl-hauteur, cyl-tranche-1…, groupe cyl-tranches. Jamais de cercles empilés à plat.',
  duration: 2600,
  aliases: ["cylindre"],
  apply(state, action, reveal) {
    const { radius: r, height: h, id } = action;
    const color = action.color ?? "blue";
    const ry = r * 0.32;
    const bottom: Vec2 = action.at ?? [0, -h / 2];
    const top = add(bottom, [0, h]);
    // La cote de hauteur, à gauche, compte dans la figure.
    state = fitFrame(state, pointsBox([add(bottom, [-r * 1.4 - 0.8, -ry]), add(top, [r, ry + 0.8])]));
    const unit = worldPerMath(state.frame);
    const parts: BoardNode[] = [
      // Arrière de la base : caché, d'un trait plus clair.
      { ...base(`${id}-base-arriere`, reveal, "muted"), type: "polygon", points: ellipse(bottom, r, ry, 0, 180), closed: false },
      { ...base(`${id}-base`, reveal, color), type: "polygon", points: ellipse(bottom, r, ry, 180, 360), closed: false },
      segment(`${id}-gauche`, add(bottom, [-r, 0]), add(top, [-r, 0]), reveal, color),
      segment(`${id}-droite`, add(bottom, [r, 0]), add(top, [r, 0]), reveal, color),
    ];
    const slices = action.slices ?? 0;
    for (let k = 1; k < slices; k++) {
      const c = add(bottom, [0, (h * k) / slices]);
      parts.push({ ...base(`${id}-tranche-${k}`, reveal, "muted"), type: "polygon", points: ellipse(c, r, ry, 180, 360), closed: false });
    }
    parts.push({
      ...base(`${id}-dessus`, reveal, color),
      type: "polygon",
      points: ellipse(top, r, ry, 0, 360).slice(0, -1),
      closed: true,
      fill: true,
      label: action.labels?.base,
      labelAt: add(top, [0, ry + 0.4 / unit]),
    });
    parts.push(segment(`${id}-rayon`, top, add(top, [r, 0]), reveal, "violet"));
    if (action.labels?.radius) parts.push(label(`${id}-rayon-l`, action.labels.radius, add(top, [r / 2, -0.28 / unit]), `${id}-rayon`, reveal, "violet"));
    const hx = bottom[0] - r - 0.45 / unit;
    parts.push(segment(`${id}-hauteur`, [hx, bottom[1]], [hx, top[1]], reveal, "orange", true));
    if (action.labels?.height) parts.push(label(`${id}-hauteur-l`, action.labels.height, [hx - 0.3 / unit, bottom[1] + h / 2], `${id}-hauteur`, reveal, "orange"));
    const tranches = Array.from({ length: Math.max(0, slices - 1) }, (_, k) => `${id}-tranche-${k + 1}`);
    return drawFigure(state, id, parts, reveal, { [`${id}-tranches`]: tranches, [`${id}-cotes`]: [`${id}-gauche`, `${id}-droite`] });
  },
});

/* -------------------------------- triangle -------------------------------- */

/** Texte écrit au centre d'un carré de Pythagore (son aire) ; "" = carré sans texte. */
const SquareText = z.string().trim().max(24);

const TriangleSchema = z
  .object({
    type: z.literal("triangle"),
    id: ShapeId,
    base: finite.positive().optional(),
    height: finite.positive().optional(),
    hyp: finite.positive().optional(),
    angle: finite.gt(0).lt(90).optional(),
    points: z.tuple([Coord, Coord, Coord]).optional(),
    at: Coord.optional(),
    rotate: finite.optional(),
    names: z.tuple([Name, Name, Name]).optional(),
    sides: z
      .object({ base: Name, height: Name, hyp: Name, ab: Name, bc: Name, ca: Name })
      .partial()
      .optional(),
    angleLabel: z.string().max(12).optional(),
    // Triangle quelconque par ses mesures (a = BC, b = CA, c = AB ; angles en A, B, C).
    lengths: z.object({ ab: finite.positive(), bc: finite.positive(), ca: finite.positive() }).partial().optional(),
    angles: z.object({ A: finite.gt(0).lt(180), B: finite.gt(0).lt(180), C: finite.gt(0).lt(180) }).partial().optional(),
    obtuse: z.boolean().optional(),
    angleLabels: z.record(z.string().max(12), z.string().max(16)).optional(),
    marks: z.record(z.string().max(12), z.number().int().min(1).max(3)).optional(),
    angleMarks: z.record(z.string().max(12), z.number().int().min(1).max(3)).optional(),
    altitude: z
      .union([
        Name,
        z.object({
          from: Name,
          foot: Name.optional(),
          label: z.string().trim().max(12).optional(),
          parts: z.tuple([z.string().trim().max(12), z.string().trim().max(12)]).optional(),
        }),
      ])
      .optional(),
    squares: z
      .union([z.literal(true), z.object({ base: SquareText, height: SquareText, hyp: SquareText, ab: SquareText, bc: SquareText, ca: SquareText }).partial()])
      .optional(),
    color: ColorName.optional(),
  })
  .refine((a) => a.points !== undefined || solveRightTriangle(a) !== null || generalSpec(a) !== undefined || !hasMeasures(a), {
    message:
      "triangle : rectangle avec deux mesures parmi base, height, hyp, angle ; quelconque avec trois mesures dans lengths (ab, bc, ca) et angles (A, B, C), dont au moins une longueur ; ou les trois points",
  });

/** Mesures données (rectangle ou quelconque) : sans aucune, on redemande la même figure (même id). */
function hasMeasures(a: { base?: number; height?: number; hyp?: number; angle?: number; lengths?: object; angles?: object; points?: unknown }): boolean {
  return [a.base, a.height, a.hyp, a.angle, a.points].some((v) => v !== undefined) || Object.keys(a.lengths ?? {}).length > 0 || Object.keys(a.angles ?? {}).length > 0;
}

/** Triangle quelconque résolu à partir de "lengths" et "angles" (côté c = AB posé à l'horizontale). */
function generalSpec(a: { lengths?: { ab?: number; bc?: number; ca?: number }; angles?: { A?: number; B?: number; C?: number }; obtuse?: boolean }) {
  if (!a.lengths && !a.angles) return undefined;
  const solved = solveTriangle({ a: a.lengths?.bc, b: a.lengths?.ca, c: a.lengths?.ab, ...a.angles }, a.obtuse ?? false);
  return solved && [solved.a, solved.b, solved.c, solved.A].every(Number.isFinite) ? solved : undefined;
}

export const triangleCommand = defineCommand({
  schema: TriangleSchema,
  doc:
    '{"type":"triangle","id":"tri","angle":30,"hyp":5,"names":["A","B","C"],"sides":{"hyp":"5 m","height":"h"},"angleLabel":"30°"}\n' +
    '  Triangle rectangle en B à partir de DEUX mesures parmi base, height, hyp, angle (angle aigu en A, en degrés) :\n' +
    '  le moteur calcule les sommets exacts. Options : "at":[x,y] (position de A), "rotate" (degrés).\n' +
    '  Parties : tri-base (= tri-adjacent, côté adjacent à A), tri-haut (= tri-oppose, opposé à A), tri-hyp,\n' +
    '  tri-droit (angle droit), tri-angle. Triangle quelconque : "points":[[x,y],[x,y],[x,y]], côtés tri-ab, tri-bc, tri-ca\n' +
    '  ("sides" : ab, bc, ca).\n' +
    '  "squares":{"base":"16","height":"9","hyp":"25"} : le moteur construit le carré sur chaque côté nommé, à l\'extérieur,\n' +
    '  avec ce texte (son aire) au centre ; "squares":true pour les trois sans texte. Parties tri-carre-base,\n' +
    '  tri-carre-haut, tri-carre-hyp, groupe tri-carres. Les longueurs ("sides") passent alors à l\'intérieur du triangle.\n' +
    '  "altitude":{"from":"B","foot":"H","label":"h","parts":["m","n"]} : le moteur trace la hauteur issue de ce sommet\n' +
    '  (pointillés, angle droit au pied, pied nommé H), exactement perpendiculaire au côté opposé (prolongé s\'il le faut).\n' +
    '  "parts" écrit la longueur des deux morceaux du côté coupé, dans l\'ordre des sommets (hauteur issue de B : AH puis HC).\n' +
    '  Parties : tri-hauteur, tri-pied (angle droit), tri-proj1, tri-proj2 (les deux morceaux). "altitude":"B" suffit.\n' +
    '  TRIANGLE QUELCONQUE par ses mesures, calculé par le moteur (côté AB à l\'horizontale) : trois mesures dans\n' +
    '  "lengths":{"ab":5,"bc":7,"ca":6} et "angles":{"A":40,"B":60}, dont au moins une longueur (CCC, CAC, ACA, AAC ;\n' +
    '  CCA donne l\'angle aigu, "obtuse":true l\'autre). Côtés tri-ab, tri-bc, tri-ca ("sides" pour leurs noms).\n' +
    '  "angleLabels":{"A":"40°","C":"?"} écrit les angles ; "marks":{"ab":1,"ca":1} met 1 à 3 traits sur les côtés égaux,\n' +
    '  "angleMarks":{"B":2} 1 à 3 arcs sur les angles égaux (triangles isométriques ou semblables). Parties tri-angle-A…\n' +
    '  Redemander le même triangle (même id) sans mesures garde ses sommets et ajoute ce qui est nouveau.\n' +
    '  Les sommets (A, B, C ou "names", et le pied H) se visent par leur nom : {"type":"angle","at":"A","from":"B","to":"C"},\n' +
    '  {"type":"segment","from":"B","to":"H"}.',
  duration: 2400,
  apply(state, action, reveal) {
    let unit = worldPerMath(state.frame);
    const color = action.color;
    let A: Vec2;
    let B: Vec2;
    let C: Vec2;
    const general = generalSpec(action);
    const previous = state.groups[action.id]?.vertices;
    let right = action.points === undefined && general === undefined;
    if (action.points) {
      [A, B, C] = action.points;
    } else if (general) {
      // A à l'origine, AB à l'horizontale, C au-dessus ; puis centré (ou A en "at").
      const { b, c, A: angleA } = general;
      const raw: Vec2[] = [[0, 0], [c, 0], [b * Math.cos(rad(angleA)), b * Math.sin(rad(angleA))]];
      const xs = raw.map((p) => p[0]);
      const ys = raw.map((p) => p[1]);
      const shift: Vec2 = action.at ?? [-(Math.min(...xs) + Math.max(...xs)) / 2, -(Math.min(...ys) + Math.max(...ys)) / 2];
      [A, B, C] = raw.map((p) => add(p, shift)) as [Vec2, Vec2, Vec2];
      if (action.rotate) {
        B = rotate(B, A, action.rotate);
        C = rotate(C, A, action.rotate);
      }
    } else if (!hasMeasures(action) && previous?.["@0"] && previous["@1"] && previous["@2"]) {
      // Même figure redemandée sans mesures (pour ajouter des carrés, une hauteur, des marques) : on garde ses sommets.
      [A, B, C] = [previous["@0"], previous["@1"], previous["@2"]];
      right = isVisible(state.nodes[`${action.id}-hyp`]);
    } else if (!hasMeasures(action)) {
      return state;
    } else {
      const { base: b, height: h } = solveRightTriangle(action)!;
      A = action.at ?? [-b / 2, -h / 2];
      B = add(A, [b, 0]);
      C = add(B, [0, h]);
      if (action.rotate) {
        B = rotate(B, A, action.rotate);
        C = rotate(C, A, action.rotate);
      }
    }
    const center = centroid([A, B, C]);
    const id = action.id;
    // Redemander la figure sans "sides" garde les longueurs déjà écrites (elles se replacent au besoin).
    const written = (sid: string): string | undefined => {
      const node = state.nodes[`${sid}-l`];
      return isVisible(node) && node.type === "text" ? node.text : undefined;
    };
    const sides: Array<[string, Vec2, Vec2, string | undefined]> = right
      ? [
          [`${id}-base`, A, B, action.sides?.base ?? written(`${id}-base`)],
          [`${id}-haut`, B, C, action.sides?.height ?? written(`${id}-haut`)],
          [`${id}-hyp`, A, C, action.sides?.hyp ?? written(`${id}-hyp`)],
        ]
      : [
          [`${id}-ab`, A, B, action.sides?.ab ?? written(`${id}-ab`)],
          [`${id}-bc`, B, C, action.sides?.bc ?? written(`${id}-bc`)],
          [`${id}-ca`, C, A, action.sides?.ca ?? written(`${id}-ca`)],
        ];

    // Carrés construits sur les côtés (Pythagore), vers l'extérieur du triangle.
    const squareKeys = right ? (["base", "height", "hyp"] as const) : (["ab", "bc", "ca"] as const);
    const squareText = (i: number): string | undefined => {
      if (action.squares === undefined) return undefined;
      if (action.squares === true) return "";
      return action.squares[squareKeys[i]!];
    };
    const SQUARE_COLORS: Color[] = ["green", "orange", "violet"];
    const squares: BoardNode[] = [];
    sides.forEach(([sid, from, to], i) => {
      const text = squareText(i);
      if (text === undefined) return;
      const [dx, dy] = sub(to, from);
      let normal: Vec2 = [-dy, dx];
      const middle = scale(add(from, to), 0.5);
      if ((center[0] - middle[0]) * normal[0] + (center[1] - middle[1]) * normal[1] > 0) normal = [dy, -dx];
      squares.push({
        ...base(`${id}-carre-${sid.slice(id.length + 1)}`, reveal, SQUARE_COLORS[i]),
        type: "polygon",
        points: [from, to, add(to, normal), add(from, normal)],
        closed: true,
        fill: true,
        label: text || undefined,
      });
    });
    const hasSquare = (i: number) => squareText(i) !== undefined;
    // Le cadre s'agrandit d'abord si la figure en déborde : la place des étiquettes (en 1/unit) en dépend.
    state = fitFrame(state, pointsBox([A, B, C, ...squares.flatMap((sq) => (sq.type === "polygon" ? sq.points : []))]));
    unit = worldPerMath(state.frame);

    const parts: BoardNode[] = sides.map(([sid, from, to]) => segment(sid, from, to, reveal, color));
    parts.push(...squares);
    // « 90° » désigne l'angle droit (en B), jamais l'angle aigu en A (séance du 19 octobre).
    const rightLabel = right && action.angleLabel !== undefined && /^90\s*°?$/.test(action.angleLabel.trim()) ? action.angleLabel : undefined;
    if (right) parts.push(angleMark(state, `${id}-droit`, B, A, C, rightLabel, true, reveal));
    if (right && ((action.angleLabel !== undefined && rightLabel === undefined) || action.angle !== undefined)) {
      parts.push(angleMark(state, `${id}-angle`, A, B, C, (rightLabel ? undefined : action.angleLabel) ?? `${action.angle}°`, false, reveal));
    }
    sides.forEach(([sid, from, to, text], i) => {
      // Un carré occupe l'extérieur du côté : la longueur s'écrit alors du côté intérieur.
      const distance = (hasSquare(i) ? -0.36 : 0.42) / unit;
      if (text) parts.push(label(`${sid}-l`, text, outward(scale(add(from, to), 0.5), center, distance), sid, reveal, color));
    });
    if (action.names) {
      [A, B, C].forEach((vertex, i) => parts.push(label(`${id}-${action.names![i]!.replace(/[^\w-]/g, "") || i}`, action.names![i]!, outward(vertex, center, 0.36 / unit), sides[0]![0], reveal)));
    }
    // Hauteur issue d'un sommet, calculée exactement (le modèle la faisait tomber à côté du côté opposé).
    const vertexNames = action.names ?? ["A", "B", "C"];
    const corners: Vec2[] = [A, B, C];
    // "@0", "@1", "@2" : les sommets dans l'ordre, pour redessiner la figure sans redonner ses mesures.
    const vertices: Record<string, Vec2> = { "@0": A, "@1": B, "@2": C };
    vertexNames.forEach((name, i) => (vertices[name] = corners[i]!));
    const vertexIndex = (key: string) => {
      const byName = vertexNames.indexOf(key);
      return byName >= 0 ? byName : ["A", "B", "C"].indexOf(key.toUpperCase());
    };
    // Angles : étiquette ("angleLabels") et marques d'égalité ("angleMarks" : 1, 2 ou 3 arcs).
    const angleKeys = new Set([...Object.keys(action.angleLabels ?? {}), ...Object.keys(action.angleMarks ?? {})]);
    for (const key of angleKeys) {
      const i = vertexIndex(key);
      // Triangle rectangle : l'angle droit a déjà sa marque, et l'angle en A son arc s'il est donné.
      if (i < 0 || (right && i === 1) || (right && i === 0 && parts.some((part) => part.id === `${id}-angle`))) continue;
      const letter = "ABC"[i]!;
      const V = corners[i]!;
      const P = corners[(i + 1) % 3]!;
      const Q = corners[(i + 2) % 3]!;
      const count = action.angleMarks?.[key] ?? 1;
      const text = action.angleLabels?.[key];
      const { start, end } = angleArc(V, P, Q);
      for (let k = 0; k < count; k++) {
        parts.push({
          ...base(k === 0 ? `${id}-angle-${letter}` : `${id}-angle-${letter}-${k + 1}`, reveal, "violet"),
          type: "arc",
          center: V,
          radius: (0.5 + 0.1 * k) / unit,
          start,
          end,
          label: k === 0 && text ? text : undefined,
        });
      }
    }
    // Côtés égaux : 1, 2 ou 3 petits traits au milieu du côté ("marks":{"ab":1,"ca":1}).
    const sideIndex: Record<string, number> = { ab: 0, bc: 1, ca: 2, base: 0, height: 1, hyp: 2 };
    const markIds: string[] = [];
    for (const [key, count] of Object.entries(action.marks ?? {})) {
      const i = sideIndex[key.toLowerCase()];
      if (i === undefined) continue;
      const [sid, from, to] = sides[i]!;
      const dir = scale(sub(to, from), 1 / Math.hypot(to[0] - from[0], to[1] - from[1]));
      const normal: Vec2 = [-dir[1], dir[0]];
      const middle = scale(add(from, to), 0.5);
      for (let k = 0; k < count; k++) {
        const at = add(middle, scale(dir, ((k - (count - 1) / 2) * 0.1) / unit));
        const mid = `${sid}-marque-${k + 1}`;
        markIds.push(mid);
        parts.push(segment(mid, add(at, scale(normal, 0.13 / unit)), add(at, scale(normal, -0.13 / unit)), reveal, color));
      }
    }
    const extra: Record<string, string[]> = {};
    if (action.altitude !== undefined) {
      const spec = typeof action.altitude === "string" ? { from: action.altitude } : action.altitude;
      const byName = vertexNames.indexOf(spec.from);
      const i = byName >= 0 ? byName : ["A", "B", "C"].indexOf(spec.from.toUpperCase());
      if (i >= 0) {
        const P = corners[i]!;
        // Les deux autres sommets, dans l'ordre des noms (hauteur issue de B : A puis C).
        const [q, r] = [(i + 1) % 3, (i + 2) % 3].sort((u, v) => u - v) as [number, number];
        const Q = corners[q]!;
        const R = corners[r]!;
        const d = sub(R, Q);
        const t = ((P[0] - Q[0]) * d[0] + (P[1] - Q[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
        const H = add(Q, scale(d, t));
        if (Math.hypot(P[0] - H[0], P[1] - H[1]) > 1e-9) {
          const footName = spec.foot ?? "H";
          vertices[footName] = H;
          parts.push(segment(`${id}-hauteur`, P, H, reveal, "violet", true));
          // L'angle droit au pied, du côté du sommet ; contre le côté (ou son prolongement).
          parts.push(angleMark(state, `${id}-pied`, H, P, t < 1 ? R : Q, undefined, true, reveal, "violet"));
          if (t < 0 || t > 1) parts.push(segment(`${id}-prolongement`, t < 0 ? Q : R, H, reveal, "muted", true));
          const away = scale(sub(H, P), 1 / Math.hypot(H[0] - P[0], H[1] - P[1]));
          parts.push(label(`${id}-${footName.replace(/[^\w-]/g, "") || "H"}`, footName, add(H, scale(away, 0.36 / unit)), `${id}-hauteur`, reveal, "violet"));
          if (spec.label) {
            const middle = scale(add(P, H), 0.5);
            const side = sub(Q, middle);
            const normal: Vec2 = [-away[1], away[0]];
            const toward = normal[0] * side[0] + normal[1] * side[1] > 0 ? normal : scale(normal, -1);
            parts.push(label(`${id}-hauteur-l`, spec.label, add(middle, scale(toward, 0.3 / unit)), `${id}-hauteur`, reveal, "violet"));
          }
          if (t >= 0 && t <= 1) {
            const pieces: Array<[string, Vec2, Vec2, Color, string | undefined]> = [
              [`${id}-proj1`, Q, H, "orange", spec.parts?.[0]],
              [`${id}-proj2`, H, R, "green", spec.parts?.[1]],
            ];
            for (const [pid, from, to, tone, text] of pieces) {
              if (!spec.parts) continue;
              parts.push(segment(pid, from, to, reveal, tone));
              if (text) parts.push(label(`${pid}-l`, text, outward(scale(add(from, to), 0.5), center, 0.42 / unit), pid, reveal, tone));
            }
          }
          extra[`${id}-hauteurs`] = [`${id}-hauteur`, `${id}-pied`];
        }
      }
    }
    // Autres noms des côtés d'un triangle rectangle (le modèle les emploie souvent) : ab, bc, ca, opposé, adjacent.
    const aliases: Record<string, string[]> = right
      ? { [`${id}-ab`]: [`${id}-base`], [`${id}-bc`]: [`${id}-haut`], [`${id}-ca`]: [`${id}-hyp`], [`${id}-oppose`]: [`${id}-haut`], [`${id}-adjacent`]: [`${id}-base`] }
      : {};
    return drawFigure(state, id, parts, reveal, { ...aliases, ...extra, [`${id}-carres`]: squares.map((s) => s.id), [`${id}-marques`]: markIds }, vertices);
  },
});

/* ------------------------------ plan incliné ------------------------------ */

export const inclineCommand = defineCommand({
  schema: z.object({
    type: z.literal("incline"),
    id: ShapeId,
    angle: finite.min(5).max(80),
    length: finite.positive().max(10_000).optional(),
    at: Coord.optional(),
    block: z.boolean().optional(),
    weight: z.boolean().optional(),
    components: z.boolean().optional(),
    normal: z.boolean().optional(),
    angleLabel: z.string().max(12).optional(),
    weightAngle: z.boolean().optional(),
  }),
  doc:
    '{"type":"incline","id":"plan","angle":25,"block":true,"weight":true,"components":true,"normal":false}\n' +
    '  Plan incliné (angle en degrés) avec un bloc, son poids P et, si demandé, ses composantes P∥ et P⊥ et la normale N.\n' +
    '  "weightAngle":true marque l\'angle θ entre P et P⊥ (le même angle que le plan : c\'est ce qui donne P∥ = P sin θ).\n' +
    '  Parties : plan-pente, plan-sol, plan-angle, plan-bloc, plan-P, plan-Px, plan-Py, plan-N, plan-angleP.\n' +
    '  Changer "angle" en redemandant la même figure la fait pivoter : le plan, le bloc et les forces suivent.\n' +
    '  Pour présenter les forces une à une, redemande la même figure (même id) avec une option de plus : seules les\n' +
    '  nouvelles parties apparaissent (d\'abord "weight":false, puis "weight":true, puis "components":true…).',
  duration: 3000,
  aliases: ["plan", "ramp", "slope"],
  apply(state, action, reveal) {
    const L = action.length ?? Math.min(state.frame.x[1] - state.frame.x[0], (state.frame.y[1] - state.frame.y[0]) * 1.6) * 0.55;
    const t = rad(action.angle);
    const A: Vec2 = action.at ?? [(-L * Math.cos(t)) / 2, (-L * Math.sin(t)) / 2];
    const B = add(A, [L * Math.cos(t), 0]);
    const C = add(B, [0, L * Math.sin(t)]);
    const u: Vec2 = [Math.cos(t), Math.sin(t)];
    const n: Vec2 = [-Math.sin(t), Math.cos(t)];
    const id = action.id;
    // Une force déjà au tableau reste dessinée quand on redemande la figure sans la redire
    // (on change l'angle : la normale suit, elle ne disparaît pas et ne reste pas à l'ancien angle).
    const shown = (part: string) => isVisible(state.nodes[`${id}-${part}`]);
    const components = action.components ?? shown("Px");
    const normal = action.normal ?? shown("N");
    const weightAngle = action.weightAngle ?? shown("angleP");

    const parts: BoardNode[] = [
      { ...base(`${id}-pente`, reveal, "muted"), type: "polygon", points: [A, B, C], closed: true, fill: true },
      segment(`${id}-sol`, sub(A, [L * 0.12, 0]), add(B, [L * 0.12, 0]), reveal, "ink"),
      angleMark(state, `${id}-angle`, A, B, C, action.angleLabel ?? "θ", false, reveal),
    ];
    if (action.block ?? true) {
      const side = L * 0.17;
      const center = add(add(A, scale(u, L * 0.58)), scale(n, side / 2));
      const corner = (du: number, dn: number) => add(center, add(scale(u, du * side), scale(n, dn * side)));
      parts.push({
        ...base(`${id}-bloc`, reveal, "violet"),
        type: "polygon",
        points: [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)],
        closed: true,
        fill: true,
      });
      // Le poids s'arrête au-dessus du sol (sur une pente douce, il le traversait et son nom
      // tombait sur la ligne du sol) ; ses composantes restent exactes, à la même échelle.
      const w = Math.min(L * 0.34, (center[1] - A[1]) * 0.75);
      const tipP = add(center, [0, -w]);
      const tipPy = add(center, scale(n, -w * Math.cos(t)));
      if (action.weight ?? true) parts.push(vector(`${id}-P`, center, tipP, "P", reveal, "orange"));
      if (components) {
        parts.push(vector(`${id}-Px`, center, add(center, scale(u, -w * Math.sin(t))), "P∥", reveal, "green"));
        parts.push(vector(`${id}-Py`, center, tipPy, "P⊥", reveal, "blue"));
        if (weightAngle) parts.push(angleMark(state, `${id}-angleP`, center, tipP, tipPy, action.angleLabel ?? "θ", false, reveal));
      }
      if (normal) parts.push(vector(`${id}-N`, center, add(center, scale(n, w * Math.cos(t))), "N", reveal, "violet"));
    }
    return drawFigure(state, id, parts, reveal);
  },
});
