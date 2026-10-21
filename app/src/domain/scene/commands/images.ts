/**
 * Transformations géométriques du programme : réflexion (symétrie par rapport à
 * une droite), translation, rotation et homothétie. Le modèle nomme la figure et
 * la transformation ; le moteur dessine l'IMAGE (une nouvelle figure, l'original
 * reste), avec les traits qui la construisent : segments perpendiculaires à l'axe
 * (réflexion), flèches de translation, rayons issus du centre (homothétie).
 * Les sommets nommés de l'image prennent un prime (A devient A') et se visent
 * ensuite par ce nom.
 */
import { z } from "zod";
import { add, deg, rad, reflectAcross, rotate, scale, sub } from "@/domain/board/shapes";
import { isVisible, resolveTargets, type BoardNode, type Reveal, type Vec2 } from "@/domain/board/state";
import { ColorName, Coord, finite, Id } from "../primitives";
import { base } from "./figure";
import { defineCommand } from "./define";
import { drawFigure, point, segment, ShapeId, vector, type Color } from "./parts";
import { LineRef, PointRef, resolveLine, resolvePoint } from "./points";
type Mapping = { map: (p: Vec2) => Vec2; k: number; mirror: boolean };

/** L'image d'un nœud (coordonnées absolues : son décalage est intégré), ou null s'il ne se transforme pas. */
function imageOf(node: BoardNode, m: Mapping, id: string, reveal: Reveal, color: Color | undefined, prime: (text: string) => string): BoardNode | null {
  const abs = (p: Vec2): Vec2 => m.map(add(p, node.offset));
  const common = { ...base(id, reveal, color ?? node.color), dim: undefined };
  switch (node.type) {
    case "point":
      return { ...node, ...common, at: abs(node.at), label: node.label ? prime(node.label) : undefined, labelAt: undefined };
    case "text":
      return { ...node, ...common, at: abs(node.at), text: prime(node.text), anchor: undefined, role: "free" };
    case "segment":
    case "vector":
      return { ...node, ...common, from: abs(node.from), to: abs(node.to), label: node.label ? prime(node.label) : undefined, labelAt: undefined };
    case "polygon":
      return { ...node, ...common, points: node.points.map(abs), param: undefined, label: node.label, labelAt: undefined };
    case "circle":
      return { ...node, ...common, center: abs(node.center), radius: node.radius * Math.abs(m.k), labelAt: undefined };
    case "arc": {
      // Les deux bouts de l'arc, transformés ; une réflexion inverse le sens de parcours.
      const end = (angle: number): Vec2 => abs([node.center[0] + node.radius * Math.cos(rad(angle)), node.center[1] + node.radius * Math.sin(rad(angle))]);
      const c = abs(node.center);
      const dir = (p: Vec2) => deg(Math.atan2(p[1] - c[1], p[0] - c[0]));
      let start = dir(end(node.start));
      let stop = dir(end(node.end));
      if (m.mirror) [start, stop] = [stop, start];
      while (stop < start) stop += 360;
      // Une marque d'angle garde sa taille (elle n'est pas agrandie par une homothétie).
      return { ...node, ...common, center: c, radius: node.radius, start, end: stop, labelAt: undefined };
    }
    case "curve":
    case "grid":
      return null;
  }
}

const KINDS = ["reflection", "translation", "rotation", "homothety"] as const;

export const imageCommand = defineCommand({
  schema: z.object({
    type: z.literal("image"),
    id: ShapeId,
    target: Id,
    kind: z.enum(KINDS),
    /** Réflexion : l'axe (id d'un segment ou deux points). */
    axis: LineRef.optional(),
    /** Translation : les composantes, ou l'id d'un vecteur du tableau. */
    by: z.union([Coord, Id]).optional(),
    /** Rotation et homothétie : le centre (point nommé ou [x,y]). */
    center: PointRef.optional(),
    angle: finite.refine((a) => Math.abs(a) <= 360).optional(),
    ratio: finite.refine((k) => k !== 0 && Math.abs(k) <= 10).optional(),
    traces: z.boolean().optional(),
    color: ColorName.optional(),
  }),
  doc:
    '{"type":"image","id":"img","target":"tri","kind":"reflection","axis":["D","E"]} : dessine l\'IMAGE d\'une figure (l\'original\n' +
    '  reste) par une transformation calculée par le moteur. "kind" : "reflection" ("axis" : id d\'un segment ou deux points),\n' +
    '  "translation" ("by" : [dx,dy] ou l\'id d\'un vecteur), "rotation" ("center", "angle" en degrés, antihoraire),\n' +
    '  "homothety" ("center", "ratio" : 2 agrandit, 0.5 réduit, négatif de l\'autre côté du centre). Les traits de\n' +
    '  construction (perpendiculaires à l\'axe, flèches, rayons depuis le centre) sont tracés ("traces":false pour non).\n' +
    '  Les sommets de l\'image prennent un prime (A devient A\') et se visent par ce nom ; parties img-<partie>.\n' +
    '  Pour des figures semblables : "homothety" ; isométriques : réflexion, translation ou rotation.',
  duration: 2200,
  aliases: ["transformation", "map"],
  apply(state, action, reveal) {
    const targets = resolveTargets(state, action.target);
    if (targets.length === 0 || isVisible(state.nodes[action.id])) return state;

    let m: Mapping;
    let center: Vec2 | null = null;
    let axis: [Vec2, Vec2] | null = null;
    let shift: Vec2 | null = null;
    switch (action.kind) {
      case "reflection":
        axis = action.axis !== undefined ? resolveLine(state, action.axis) : null;
        if (!axis) return state;
        m = { map: (p) => reflectAcross(p, ...axis!), k: 1, mirror: true };
        break;
      case "translation": {
        if (action.by === undefined) return state;
        if (typeof action.by === "string") {
          const v = state.nodes[action.by];
          if (!isVisible(v) || v.type !== "vector") return state;
          shift = sub(v.to, v.from);
        } else shift = action.by;
        const d = shift;
        m = { map: (p) => add(p, d), k: 1, mirror: false };
        break;
      }
      case "rotation":
        center = action.center !== undefined ? resolvePoint(state, action.center) : null;
        if (!center || action.angle === undefined) return state;
        m = { map: (p) => rotate(p, center!, action.angle!), k: 1, mirror: false };
        break;
      case "homothety": {
        center = action.center !== undefined ? resolvePoint(state, action.center) : null;
        if (!center || action.ratio === undefined) return state;
        const k = action.ratio;
        const o = center;
        m = { map: (p) => add(o, scale(sub(p, o), k)), k, mirror: false };
        break;
      }
    }

    // Les sommets nommés de la figure (triangle, points construits) et leurs images A'.
    const source = state.groups[action.target]?.vertices ?? {};
    const named = Object.entries(source).filter(([name]) => !name.startsWith("@"));
    const offsetOf = (() => {
      const part = (state.groups[action.target]?.members ?? []).map((nid) => state.nodes[nid]).find(isVisible);
      return part?.offset ?? ([0, 0] as Vec2);
    })();
    const vertexNames = new Set(named.map(([name]) => name));
    for (const tid of targets) {
      const node = state.nodes[tid];
      if (node?.type === "point" && node.label) vertexNames.add(node.label);
    }
    const prime = (text: string) => (vertexNames.has(text) ? `${text}'` : text);

    const parts: BoardNode[] = [];
    for (const tid of targets) {
      const node = state.nodes[tid];
      if (!isVisible(node)) continue;
      const image = imageOf(node, m, `${action.id}-${tid}`, reveal, action.color ?? "orange", prime);
      if (image) parts.push(image);
    }
    if (parts.length === 0) return state;

    // Les points qui guident la construction : sommets nommés, sinon les points de la figure.
    const guides: Vec2[] = named.length > 0 ? named.map(([, p]) => add(p, offsetOf)) : [];
    if (guides.length === 0) {
      for (const tid of targets) {
        const node = state.nodes[tid];
        if (node?.type === "point") guides.push(add(node.at, node.offset));
        if (node?.type === "polygon") guides.push(...node.points.slice(0, 6).map((p) => add(p, node.offset)));
      }
    }
    const traces: BoardNode[] = [];
    if (action.traces !== false) {
      guides.slice(0, 6).forEach((p, i) => {
        const q = m.map(p);
        const tid = `${action.id}-trace-${i + 1}`;
        if (action.kind === "translation") traces.push(vector(tid, p, q, "", reveal, "muted"));
        // Homothétie : le rayon issu du centre passe par le point et son image (le plus loin des deux).
        else if (action.kind === "homothety" && center) traces.push(segment(tid, center, m.k < 0 || Math.abs(m.k) >= 1 ? q : p, reveal, "muted", true));
        else if (action.kind === "reflection") traces.push(segment(tid, p, q, reveal, "muted", true));
      });
    }
    if (action.kind === "homothety" && center) parts.push(point(`${action.id}-centre`, center, undefined, reveal, "ink"));

    // Les traits d'abord, puis l'image ; l'image se vise par son id, ses sommets par leur nom prime (A').
    const vertices: Record<string, Vec2> = {};
    for (const [name, p] of named) vertices[`${name}'`] = m.map(add(p, offsetOf));
    const next = drawFigure(state, `${action.id}-traces`, traces, reveal);
    return drawFigure(next, action.id, parts, { start: reveal.start + reveal.duration * 0.35, duration: reveal.duration * 0.65 }, {}, named.length > 0 ? vertices : undefined);
  },
});
