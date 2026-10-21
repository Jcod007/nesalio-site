/**
 * Solides du programme (volumes et aires, sec 3) dessinés en perspective au
 * tableau 2D : prisme et pavé droit, pyramide, cylindre, cône, boule. Le modèle
 * donne les dimensions ; le moteur projette, choisit les arêtes cachées (en
 * pointillés clairs) et pose les cotes. Jamais de solide « à plat » (des
 * cercles empilés) ni d'arêtes calculées à la main.
 *
 * Polyèdres : vue axonométrique (légère rotation, vue un peu d'en haut) ; une
 * arête est cachée quand les deux faces qui la bordent tournent le dos à
 * l'élève. Solides ronds : base en ellipse, même inclinaison.
 */
import { z } from "zod";
import { fitFrame, worldPerMath } from "@/domain/board/layout";
import { add, rad, regularPolygon, scale, sub } from "@/domain/board/shapes";
import { type BoardNode, type BoardState, type Reveal, type Vec2 } from "@/domain/board/state";
import { ColorName, Coord, finite } from "../primitives";
import { base } from "./figure";
import { defineCommand } from "./define";
import { drawFigure, label, Name, pointsBox, segment, ShapeId, type Color } from "./parts";

/** Inclinaison de la vue : une base circulaire de rayon r devient une ellipse de demi-hauteur r × TILT. */
const TILT = 0.32;
const PITCH = Math.asin(TILT);
const YAW = rad(25);

type Vec3 = [number, number, number];

/** Projection d'un point de l'espace (x à droite, y en profondeur, z vers le haut) sur le tableau. */
function project([x, y, z]: Vec3): Vec2 {
  const x1 = x * Math.cos(YAW) - y * Math.sin(YAW);
  const y1 = x * Math.sin(YAW) + y * Math.cos(YAW);
  return [x1, y1 * Math.sin(PITCH) + z * Math.cos(PITCH)];
}

/** Une face (normale extérieure) est-elle tournée vers l'élève ? */
function facesViewer([nx, ny, nz]: Vec3): boolean {
  const y1 = nx * Math.sin(YAW) + ny * Math.cos(YAW);
  return y1 * Math.cos(PITCH) - nz * Math.sin(PITCH) < 0;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Base d'un prisme ou d'une pyramide, dans le plan z = 0, centrée à l'origine (sommets dans le sens antihoraire). */
const BaseShape = z.enum(["rectangle", "square", "triangle", "regular"]);
function basePolygon(shape: z.infer<typeof BaseShape>, length: number, width: number, sides: number): Vec3[] {
  if (shape === "rectangle" || shape === "square") {
    const [a, b] = [length / 2, (shape === "square" ? length : width) / 2];
    return [[-a, -b, 0], [a, -b, 0], [a, b, 0], [-a, b, 0]];
  }
  return regularPolygon(shape === "triangle" ? 3 : sides, length).map(([x, y]) => [x, y, 0] as Vec3);
}

interface Polyhedron {
  vertices: Vec3[];
  /** Faces : indices des sommets. */
  faces: number[][];
}

/** Arêtes d'un polyèdre convexe, chacune visible ou cachée selon les faces qui la bordent. */
function edgesOf({ vertices, faces }: Polyhedron): Array<{ a: number; b: number; hidden: boolean }> {
  const center = scale3(vertices.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]] as Vec3, [0, 0, 0]), 1 / vertices.length);
  const visible = faces.map((face) => {
    const [p, q, r] = [vertices[face[0]!]!, vertices[face[1]!]!, vertices[face[2]!]!];
    let n = cross(minus(q, p), minus(r, p));
    if (dot3(n, minus(p, center)) < 0) n = [-n[0], -n[1], -n[2]];
    return facesViewer(n);
  });
  const edges = new Map<string, { a: number; b: number; seen: boolean }>();
  faces.forEach((face, f) => {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const edge = edges.get(key) ?? { a: Math.min(a, b), b: Math.max(a, b), seen: false };
      edge.seen ||= visible[f]!;
      edges.set(key, edge);
    });
  });
  return [...edges.values()].map(({ a, b, seen }) => ({ a, b, hidden: !seen }));
}
const scale3 = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

/** Place le solide : son dessin centré en `at` (ou à l'origine), le cadre agrandi s'il le faut. */
function placed(state: BoardState, points: Vec2[], at: Vec2 | undefined): { state: BoardState; shift: Vec2; unit: number } {
  const box = pointsBox(points);
  const shift = sub(at ?? [0, 0], [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2]);
  const moved = points.map((p) => add(p, shift));
  const next = fitFrame(state, pointsBox([...moved, add(moved[0]!, [-1, -1]), add(moved[0]!, [1, 1])]));
  return { state: next, shift, unit: worldPerMath(next.frame) };
}

/** Arêtes dessinées (cachées en pointillés clairs), et la face de base coloriée. */
function polyhedronParts(id: string, solid: Polyhedron, base2: number[], to2: (v: Vec3) => Vec2, reveal: Reveal, color: Color): BoardNode[] {
  const parts: BoardNode[] = edgesOf(solid).map(({ a, b, hidden }, i) =>
    segment(`${id}-arete-${i + 1}`, to2(solid.vertices[a]!), to2(solid.vertices[b]!), reveal, hidden ? "muted" : color, hidden),
  );
  parts.unshift({ ...base(`${id}-base`, reveal, color), type: "polygon", points: base2.map((i) => to2(solid.vertices[i]!)), closed: true, fill: true });
  return parts;
}

const Labels = z.object({ length: Name, width: Name, height: Name, side: Name, radius: Name, slant: Name, base: Name }).partial();

/** Cote posée au milieu d'une arête, un peu à l'extérieur du solide. */
function dimension(id: string, text: string, from: Vec2, to: Vec2, center: Vec2, unit: number, reveal: Reveal, target: string, color?: Color) {
  const middle = scale(add(from, to), 0.5);
  const away = sub(middle, center);
  const n = Math.hypot(away[0], away[1]) || 1;
  return label(id, text, add(middle, scale(away, 0.4 / unit / n)), target, reveal, color);
}

/* --------------------------------- prisme --------------------------------- */

export const prismCommand = defineCommand({
  schema: z.object({
    type: z.literal("prism"),
    id: ShapeId,
    base: BaseShape.optional(),
    length: finite.positive().max(10_000),
    width: finite.positive().max(10_000).optional(),
    sides: z.number().int().min(3).max(12).optional(),
    height: finite.positive().max(10_000),
    at: Coord.optional(),
    labels: Labels.optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"prism","id":"p","base":"rectangle","length":5,"width":3,"height":4,"labels":{"length":"5 cm","width":"3 cm","height":"4 cm"}}\n' +
    '  Prisme droit en perspective, arêtes cachées en pointillés : "base" "rectangle" (pavé droit : length × width),\n' +
    '  "square" (côté length ; cube si height = length), "triangle" (équilatéral de côté length), "regular" ("sides" côtés\n' +
    '  de longueur length). Parties : p-base (la base coloriée : son aire), p-arete-1…, p-hauteur-l, p-length-l…',
  duration: 2600,
  aliases: ["pave", "cube", "box"],
  apply(state, action, reveal) {
    const shape = action.base ?? "rectangle";
    const bottom = basePolygon(shape, action.length, action.width ?? action.length, action.sides ?? 6);
    const n = bottom.length;
    const top = bottom.map(([x, y]) => [x, y, action.height] as Vec3);
    const solid: Polyhedron = {
      vertices: [...bottom, ...top],
      faces: [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => n + i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])],
    };
    const flat = solid.vertices.map(project);
    const { state: next, shift, unit } = placed(state, flat, action.at);
    const to2 = (v: Vec3) => add(project(v), shift);
    const color = action.color ?? "blue";
    const parts = polyhedronParts(action.id, solid, Array.from({ length: n }, (_, i) => i), to2, reveal, color);
    const center = to2([0, 0, action.height / 2]);
    const L = action.labels ?? {};
    // Cotes : longueur sur l'arête avant de la base, largeur sur l'arête de droite, hauteur sur une arête verticale avant.
    if (L.length || L.side) parts.push(dimension(`${action.id}-length-l`, (L.length ?? L.side)!, to2(bottom[0]!), to2(bottom[1]!), center, unit, reveal, `${action.id}-base`));
    if (L.width && n === 4) parts.push(dimension(`${action.id}-width-l`, L.width, to2(bottom[1]!), to2(bottom[2]!), center, unit, reveal, `${action.id}-base`));
    if (L.height) parts.push(dimension(`${action.id}-hauteur-l`, L.height, to2(bottom[1]!), to2(top[1]!), center, unit, reveal, `${action.id}-base`, "orange"));
    if (L.base) parts.push(label(`${action.id}-base-l`, L.base, to2([0, 0, 0]), `${action.id}-base`, reveal, color));
    return drawFigure(next, action.id, parts, reveal);
  },
});

/* -------------------------------- pyramide -------------------------------- */

export const pyramidCommand = defineCommand({
  schema: z.object({
    type: z.literal("pyramid"),
    id: ShapeId,
    base: BaseShape.optional(),
    length: finite.positive().max(10_000),
    width: finite.positive().max(10_000).optional(),
    sides: z.number().int().min(3).max(12).optional(),
    height: finite.positive().max(10_000),
    at: Coord.optional(),
    labels: Labels.optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"pyramid","id":"py","base":"square","length":4,"height":6,"labels":{"side":"4 cm","height":"6 cm"}}\n' +
    '  Pyramide droite (sommet au-dessus du centre de la base), mêmes bases que "prism". La hauteur est tracée en\n' +
    '  pointillés du sommet au centre de la base, avec l\'angle droit. Parties : py-base, py-arete-1…, py-hauteur, py-apothème\n' +
    '  si "labels.slant" (hauteur d\'une face latérale, pour l\'aire latérale).',
  duration: 2600,
  aliases: ["pyramide"],
  apply(state, action, reveal) {
    const bottom = basePolygon(action.base ?? "square", action.length, action.width ?? action.length, action.sides ?? 6);
    const n = bottom.length;
    const apex: Vec3 = [0, 0, action.height];
    const solid: Polyhedron = {
      vertices: [...bottom, apex],
      faces: [Array.from({ length: n }, (_, i) => i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n])],
    };
    const { state: next, shift, unit } = placed(state, solid.vertices.map(project), action.at);
    const to2 = (v: Vec3) => add(project(v), shift);
    const color = action.color ?? "blue";
    const id = action.id;
    const parts = polyhedronParts(id, solid, Array.from({ length: n }, (_, i) => i), to2, reveal, color);
    const foot = to2([0, 0, 0]);
    const top = to2(apex);
    parts.push(segment(`${id}-hauteur`, top, foot, reveal, "orange", true));
    const center = to2([0, 0, action.height / 3]);
    const L = action.labels ?? {};
    if (L.height) parts.push(label(`${id}-hauteur-l`, L.height, add(scale(add(top, foot), 0.5), [0.3 / unit, 0]), `${id}-hauteur`, reveal, "orange"));
    if (L.length || L.side) parts.push(dimension(`${id}-length-l`, (L.length ?? L.side)!, to2(bottom[0]!), to2(bottom[1]!), center, unit, reveal, `${id}-base`));
    if (L.slant) {
      // Apothème : du sommet au milieu de l'arête avant de la base.
      const mid: Vec3 = scale3([bottom[0]![0] + bottom[1]![0], bottom[0]![1] + bottom[1]![1], 0], 0.5);
      parts.push(segment(`${id}-apotheme`, top, to2(mid), reveal, "green", true));
      parts.push(dimension(`${id}-apotheme-l`, L.slant, top, to2(mid), center, unit, reveal, `${id}-apotheme`, "green"));
    }
    return drawFigure(next, id, parts, reveal);
  },
});

/* ------------------------- solides ronds : ellipses ------------------------- */

/** Ellipse d'un cercle horizontal vu en perspective : de start à end degrés. */
function ellipse(center: Vec2, rx: number, ry: number, start: number, end: number, samples = 32): Vec2[] {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = rad(start + ((end - start) * i) / samples);
    return [center[0] + rx * Math.cos(t), center[1] + ry * Math.sin(t)] as Vec2;
  });
}

/** Cercle de base : moitié avant pleine, moitié arrière (cachée) en trait clair. */
function baseEllipse(id: string, center: Vec2, r: number, reveal: Reveal, color: Color): BoardNode[] {
  return [
    { ...base(`${id}-base-arriere`, reveal, "muted"), type: "polygon", points: ellipse(center, r, r * TILT, 0, 180), closed: false },
    { ...base(`${id}-base`, reveal, color), type: "polygon", points: ellipse(center, r, r * TILT, 180, 360), closed: false },
  ];
}

export const cylinderCommand = defineCommand({
  schema: z.object({
    type: z.literal("cylinder"),
    id: ShapeId,
    radius: finite.positive().max(10_000),
    height: finite.positive().max(10_000),
    at: Coord.optional(),
    slices: z.number().int().min(0).max(12).optional(),
    labels: Labels.optional(),
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
    const ry = r * TILT;
    const bottom: Vec2 = action.at ?? [0, -h / 2];
    const top = add(bottom, [0, h]);
    // La cote de hauteur, à gauche, compte dans la figure.
    state = fitFrame(state, pointsBox([add(bottom, [-r * 1.4 - 0.8, -ry]), add(top, [r, ry + 0.8])]));
    const unit = worldPerMath(state.frame);
    const parts: BoardNode[] = [
      ...baseEllipse(id, bottom, r, reveal, color),
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

export const coneCommand = defineCommand({
  schema: z.object({
    type: z.literal("cone"),
    id: ShapeId,
    radius: finite.positive().max(10_000),
    height: finite.positive().max(10_000),
    at: Coord.optional(),
    labels: Labels.optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"cone","id":"co","radius":3,"height":4,"labels":{"radius":"3 cm","height":"4 cm","slant":"5 cm"}}\n' +
    '  Cône droit en perspective : base en ellipse, côtés jusqu\'au sommet, hauteur en pointillés (angle droit au centre),\n' +
    '  rayon, et génératrice nommée si "labels.slant". Parties : co-base, co-cotes, co-hauteur, co-rayon, co-generatrice.',
  duration: 2400,
  aliases: ["cône"],
  apply(state, action, reveal) {
    const { radius: r, height: h, id } = action;
    const color = action.color ?? "blue";
    const center: Vec2 = action.at ?? [0, -h / 2];
    const apex = add(center, [0, h]);
    state = fitFrame(state, pointsBox([add(center, [-r - 0.8, -r * TILT - 0.6]), add(apex, [r + 0.8, 0.6])]));
    const unit = worldPerMath(state.frame);
    const parts: BoardNode[] = [
      ...baseEllipse(id, center, r, reveal, color),
      segment(`${id}-gauche`, add(center, [-r, 0]), apex, reveal, color),
      segment(`${id}-generatrice`, add(center, [r, 0]), apex, reveal, color),
      segment(`${id}-hauteur`, apex, center, reveal, "orange", true),
      segment(`${id}-rayon`, center, add(center, [r, 0]), reveal, "violet"),
      { ...base(`${id}-droit`, reveal, "muted"), type: "polygon", points: [add(center, [0.2 / unit, 0]), add(center, [0.2 / unit, 0.2 / unit]), add(center, [0, 0.2 / unit])], closed: false },
    ];
    const L = action.labels ?? {};
    if (L.radius) parts.push(label(`${id}-rayon-l`, L.radius, add(center, [r / 2, -0.3 / unit]), `${id}-rayon`, reveal, "violet"));
    if (L.height) parts.push(label(`${id}-hauteur-l`, L.height, add(center, [-0.35 / unit, h / 2]), `${id}-hauteur`, reveal, "orange"));
    if (L.slant) parts.push(label(`${id}-generatrice-l`, L.slant, add(scale(add(add(center, [r, 0]), apex), 0.5), [0.4 / unit, 0]), `${id}-generatrice`, reveal, color));
    return drawFigure(state, id, parts, reveal, { [`${id}-cotes`]: [`${id}-gauche`, `${id}-generatrice`] });
  },
});

export const sphereCommand = defineCommand({
  schema: z.object({
    type: z.literal("sphere"),
    id: ShapeId,
    radius: finite.positive().max(10_000),
    at: Coord.optional(),
    labels: Labels.optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"sphere","id":"b","radius":3,"labels":{"radius":"3 cm"}} : boule (sphère) avec son équateur en perspective\n' +
    '  (arrière en trait clair) et son rayon. Parties : b-contour, b-equateur, b-rayon.',
  duration: 1800,
  aliases: ["boule", "ball"],
  apply(state, action, reveal) {
    const { radius: r, id } = action;
    const color = action.color ?? "blue";
    const center: Vec2 = action.at ?? [0, 0];
    state = fitFrame(state, pointsBox([add(center, [-r - 0.6, -r - 0.6]), add(center, [r + 0.6, r + 0.6])]));
    const unit = worldPerMath(state.frame);
    const parts: BoardNode[] = [
      { ...base(`${id}-contour`, reveal, color), type: "circle", center, radius: r },
      { ...base(`${id}-equateur-arriere`, reveal, "muted"), type: "polygon", points: ellipse(center, r, r * TILT, 0, 180), closed: false },
      { ...base(`${id}-equateur`, reveal, color), type: "polygon", points: ellipse(center, r, r * TILT, 180, 360), closed: false },
      segment(`${id}-rayon`, center, add(center, [r, 0]), reveal, "violet"),
      { ...base(`${id}-centre`, reveal, "ink"), type: "point", at: center },
    ];
    if (action.labels?.radius) parts.push(label(`${id}-rayon-l`, action.labels.radius, add(center, [r / 2, 0.3 / unit]), `${id}-rayon`, reveal, "violet"));
    return drawFigure(state, id, parts, reveal);
  },
});
