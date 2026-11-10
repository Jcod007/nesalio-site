import { FIGURE_TYPES, type Group, type MathContext, type RuntimeState, type SceneObject, type Slice } from "./contract";
import { measureSceneObject } from "./measurement";
import { avoidOverlap, beside, center, gapSize, intersects, positionFor, translate, union, type Box, type Gap, type Layout, type Point } from "./placement";


export interface Measurement {
  /** Geometry in local world units, with y increasing upwards. */
  body: Box;
  /** Optional envelope covering the object over its declared parameter range. */
  reserve?: Box;
  anchors?: Readonly<Record<string, { point: Point; outward: "left" | "right" | "up" | "down" }>>;
  /** Intentional overlays, such as a graph and its axes, can opt out of collision checks. */
  allowOverlap?: boolean;
  /**
   * The figure's actual strokes (axis lines, a curve's path) in local units.
   * Texts avoid these instead of the whole rectangle, so a label can sit near a point on the axes.
   */
  collision?: readonly Box[];
}

/** `window`: for a curve on axes, the axes' area in the frame's coordinates; the curve stops at its edges. */
export type MeasureObject = (object: SceneObject, values: ReadonlyMap<string, number>, math: MathContext, window?: Box) => Measurement;

export interface PlacedObject {
  readonly definition: SceneObject;
  readonly position: Point;
  readonly measurement: Measurement;
  readonly visible: boolean;
  /** For a figure: the frame whose mathematical coordinates it uses. */
  readonly frame?: string;
  /** Parts written so far, only while a formula is partly written. Absent means the whole object. */
  readonly revealedParts?: ReadonlySet<string>;
  readonly leader?: { from: Point; to: Point };
  /** Still visible, but stepped back (`dim`). */
  readonly dimmed?: boolean;
  /** Erased by `remove`: no longer visible, no longer takes space, never used again. */
  readonly removed?: boolean;
  /** Hidden by `fade_out`: its place is free for what comes next, but `show` may bring it back. */
  readonly faded?: boolean;
  /** For a curve sharing a frame with axes: the axes' area, where it is drawn. */
  readonly window?: Box;
}

/** Whether a part of a visible object is on the board. */
export function partVisible(object: PlacedObject, part: string): boolean {
  return object.visible && (!object.revealedParts || object.revealedParts.has(part));
}

export interface SavedCameraFrame {
  readonly targets: readonly string[];
  readonly bounds?: Bounds;
  readonly state: RuntimeState["camera"]["state"];
}

export interface SceneState {
  readonly objects: ReadonlyMap<string, PlacedObject>;
  readonly groups: ReadonlyMap<string, Group>;
  readonly slices: ReadonlyMap<string, ReadonlySet<string>>;
  readonly math: MathContext;
  readonly parameters: ReadonlyMap<string, number>;
  readonly initialViewport: Box;
  readonly minGap: Gap;
  readonly currentSlice: string | null;
  readonly currentBeat: string | null;
  readonly camera: RuntimeState["camera"];
  readonly savedCamera: ReadonlyMap<string, SavedCameraFrame>;
  /** World offset of each figure frame, fixed once placed (spec §1). */
  readonly frames: ReadonlyMap<string, Point>;
  /** Area of the last composition: where the next one is placed when it has no relation (spec §7). */
  readonly lastComposition: Box | null;
  /** Formula → the formula a `transform` turned it into. A later gesture on the old one means the new one. */
  readonly replacedBy: ReadonlyMap<string, string>;
  /**
   * Objects set aside on an edge or in a corner (move or layout to_edge / to_corner): the lesson
   * wants them kept in view, so every framing tries to include them while they are shown.
   */
  readonly kept: ReadonlySet<string>;
}

/** Kept objects still worth framing: on the board, and not stepped back. */
export function keptInView(state: SceneState): string[] {
  return [...state.kept].filter((id) => {
    const item = state.objects.get(id);
    return item ? item.visible && !item.dimmed && !item.removed : state.groups.has(id);
  });
}

/** The formula now standing where `id` was, following transforms (e1 → e2 → e3). */
export function currentId(state: SceneState, id: string): string {
  const seen = new Set<string>();
  let current = id;
  while (state.replacedBy.has(current) && !seen.has(current)) {
    seen.add(current);
    current = state.replacedBy.get(current)!;
  }
  return current;
}

const origin: Point = [0, 0];

export function createScene(initialViewport: Box, minGap: Gap = "sm"): SceneState {
  checkBox(initialViewport);
  const [x, y] = center(initialViewport);
  return {
    objects: new Map(), groups: new Map(), slices: new Map(),
    math: { symbols: {}, expressions: {} }, parameters: new Map(),
    initialViewport, minGap, currentSlice: null, currentBeat: null,
    camera: { state: { x, y, zoom: 1 }, is_animating: false },
    savedCamera: new Map(),
    frames: new Map(), lastComposition: null, replacedBy: new Map(), kept: new Set(),
  };
}

/** Accepts the accumulated math context from the validator and keeps values already set by playback. */
export function withMathContext(state: SceneState, math: MathContext): SceneState {
  const parameters = new Map(state.parameters);
  for (const [id, symbol] of Object.entries(math.symbols)) {
    if (symbol.kind === "parameter" && !parameters.has(id)) parameters.set(id, symbol.initial);
  }
  return { ...state, math, parameters };
}

export function symbolValues(state: SceneState): Map<string, number> {
  const values = new Map(state.parameters);
  for (const [id, symbol] of Object.entries(state.math.symbols)) {
    if (symbol.kind === "constant") values.set(id, symbol.value);
  }
  return values;
}

function childrenOf(definitions: Iterable<SceneObject>): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const object of definitions) {
    const parent = object.attachment?.parent;
    if (!parent) continue;
    const siblings = children.get(parent) ?? [];
    siblings.push(object.id);
    children.set(parent, siblings);
  }
  return children;
}

function descendants(id: string, groups: ReadonlyMap<string, Group>, children: ReadonlyMap<string, string[]>): Set<string> {
  const result = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(groups.get(current)?.items ?? []), ...(children.get(current) ?? []));
  }
  return result;
}

type Bounds = "layout_bounds" | "render_bounds";
function body(object: PlacedObject, mode: Bounds): Box {
  return translate(mode === "layout_bounds" ? object.measurement.reserve ?? object.measurement.body : object.measurement.body, object.position);
}

/** Hidden objects reserve space but contribute no visible geometry. */
export function sceneBounds(state: SceneState, targets: readonly string[], mode: Bounds): Box | null {
  const children = childrenOf([...state.objects.values()].map(({ definition }) => definition));
  return boundsFor(state, targets, mode, children);
}

function boundsFor(state: SceneState, targets: readonly string[], mode: Bounds, children: ReadonlyMap<string, string[]>): Box | null {
  const ids = new Set(targets.flatMap((id) => [...descendants(id, state.groups, children)]));
  return union([...ids].map((id) => {
    const object = state.objects.get(id);
    return object && !object.removed && (mode === "layout_bounds" || object.visible) ? body(object, mode) : null;
  }));
}

function anchorOn(box: Box, name: string): NonNullable<Measurement["anchors"]>[string] | undefined {
  const [x, y] = center(box);
  switch (name) {
    case "left": return { point: [box.x0, y], outward: "left" };
    case "right": return { point: [box.x1, y], outward: "right" };
    case "top": return { point: [x, box.y1], outward: "up" };
    case "bottom": return { point: [x, box.y0], outward: "down" };
    case "center": return { point: [x, y], outward: "up" };
    default: return undefined;
  }
}

function attachmentPosition(
  object: SceneObject, local: Box, parent: PlacedObject | undefined, parentBox: Box, defaultGap: Gap,
): { position: Point; axis: 0 | 1; anchor: Point } {
  const { anchor, placement, gap } = object.attachment!;
  const measured = parent?.measurement.anchors;
  const named = measured && Object.hasOwn(measured, anchor) ? measured[anchor] : undefined;
  const resolved = named && parent ? {
    point: [named.point[0] + parent.position[0], named.point[1] + parent.position[1]] as Point,
    outward: named.outward,
  } : anchorOn(parentBox, anchor);
  if (!resolved) throw new Error(`Ancre indisponible « ${anchor} » pour « ${object.id} ».`);
  const [x, y] = resolved.point;
  const axis = resolved.outward === "up" || resolved.outward === "down" ? 0 : 1;
  if (placement === "inside") {
    const [cx, cy] = center(local);
    return { position: [x - cx, y - cy], axis, anchor: resolved.point };
  }
  return { position: beside(local, { x0: x, y0: y, x1: x, y1: y }, resolved.outward, gapSize(gap ?? defaultGap)), axis, anchor: resolved.point };
}

/** Largest side of a parent whose label may move to another side of it (a point, a small mark). */
const SMALL_PARENT = 0.6;

/**
 * A free place for a label next to a small parent, on another side than the one asked: the
 * corners on the asked side first, then the other sides and corners. Undefined when the parent
 * is large or every side is taken (the caller then slides the label away with a leader line).
 */
function besideSmallParent(local: Box, parent: Box, gap: number, anchor: string, obstacles: readonly Box[]): Point | undefined {
  if (Math.max(parent.x1 - parent.x0, parent.y1 - parent.y0) > SMALL_PARENT) return;
  const w = local.x1 - local.x0, h = local.y1 - local.y0;
  const [cx, cy] = center(parent);
  // Lower-left corner of the label for each side and corner.
  const corners: Record<string, Point> = {
    top: [cx - w / 2, parent.y1 + gap], bottom: [cx - w / 2, parent.y0 - gap - h],
    left: [parent.x0 - gap - w, cy - h / 2], right: [parent.x1 + gap, cy - h / 2],
    top_right: [parent.x1 + gap, parent.y1 + gap], top_left: [parent.x0 - gap - w, parent.y1 + gap],
    bottom_right: [parent.x1 + gap, parent.y0 - gap - h], bottom_left: [parent.x0 - gap - w, parent.y0 - gap - h],
  };
  const order = anchor === "top" ? ["top_right", "top_left", "right", "left", "bottom_right", "bottom_left", "bottom"]
    : anchor === "left" ? ["top_left", "bottom_left", "top", "bottom", "top_right", "bottom_right", "right"]
    : anchor === "right" ? ["top_right", "bottom_right", "top", "bottom", "top_left", "bottom_left", "left"]
    : ["bottom_right", "bottom_left", "right", "left", "top_right", "top_left", "top"];
  for (const side of order) {
    const [x, y] = corners[side]!;
    const position: Point = [x - local.x0, y - local.y0];
    if (!obstacles.some((other) => intersects(translate(local, position), other))) return position;
  }
}

function leaderFor(anchor: Point, box: Box): PlacedObject["leader"] {
  const [x, y] = anchor;
  const to: Point = [Math.max(box.x0, Math.min(box.x1, x)), Math.max(box.y0, Math.min(box.y1, y))];
  return to[0] === x && to[1] === y ? undefined : { from: anchor, to };
}

function checkBox(box: Box): void {
  if (![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) || box.x0 > box.x1 || box.y0 > box.y1) {
    throw new Error("Dimensions de scène invalides.");
  }
}

function measureValid(measure: MeasureObject, object: SceneObject, values: ReadonlyMap<string, number>, math: MathContext, window?: Box): Measurement {
  const measurement = measure(object, values, math, window);
  checkBox(measurement.body);
  if (measurement.reserve) {
    checkBox(measurement.reserve);
    const { body: box, reserve } = measurement;
    if (box.x0 < reserve.x0 || box.x1 > reserve.x1 || box.y0 < reserve.y0 || box.y1 > reserve.y1) {
      throw new Error(`L’objet « ${object.id} » dépasse l’espace réservé.`);
    }
  }
  return measurement;
}

/** Prepare a validated slice transactionally. Previously placed objects keep their positions. */
export function introduceSlice(state: SceneState, slice: Slice, measure = measureSceneObject): SceneState {
  if (state.slices.has(slice.slice_id)) throw new Error(`Tranche déjà préparée « ${slice.slice_id} ».`);
  const objects = new Map(state.objects);
  const groups = new Map(state.groups);
  const added = new Map(slice.introduces.map((object) => [object.id, object]));
  const values = symbolValues(state);
  for (const group of slice.groups ?? []) {
    if (groups.has(group.id) || objects.has(group.id) || added.has(group.id)) throw new Error(`Cible déjà déclarée « ${group.id} ».`);
    groups.set(group.id, group);
  }
  for (const id of added.keys()) {
    if (state.objects.has(id) || state.groups.has(id)) throw new Error(`Cible déjà déclarée « ${id} ».`);
  }
  const children = childrenOf([...state.objects.values()].map(({ definition }) => definition).concat([...added.values()]));
  const owners = new Map<string, string>();
  for (const group of slice.groups ?? []) {
    if (!group.arrange && !group.layout) continue;
    for (const member of group.items) {
      if (owners.has(member)) throw new Error(`« ${member} » a plusieurs groupes de placement.`);
      owners.set(member, group.id);
    }
  }
  const resolving = new Set<string>();
  const completed = new Set<string>();
  const positioning = new Set<string>();
  const next = { ...state, objects, groups };
  const gap = gapSize(state.minGap);
  const blockGap = gapSize("lg");
  const frames = new Map(state.frames);
  // A formula produced by `transform` takes its source's place: a calculation stays where it is.
  const morphSource = new Map<string, string>();
  for (const beat of slice.beats) for (const action of beat.do) {
    if (action.verb === "transform") morphSource.set(action.target, action.source);
  }
  // The latest composition placed without a relation: the next one goes below or beside it.
  let cursor: Box | null = state.lastComposition;

  /** What a text must not cover: a figure's strokes, otherwise an object's reserved box. */
  function obstacles(excluded: ReadonlySet<string>): Box[] {
    return [...objects.entries()].flatMap(([id, item]) => {
      if (excluded.has(id) || item.removed || item.faded) return [];
      if (item.measurement.collision) return item.measurement.collision.map((box) => translate(box, item.position));
      return item.measurement.allowOverlap ? [] : [body(item, "layout_bounds")];
    });
  }

  /** Whole areas already used on the board, for a new block that has no relation. */
  function occupied(excluded: ReadonlySet<string>): Box[] {
    return [...objects.entries()].flatMap(([id, item]) => excluded.has(id) || item.removed || item.faded ? [] : [body(item, "layout_bounds")]);
  }

  /**
   * A free place for a new block (spec §7): never over what is already there,
   * below the latest composition, else beside it, else beside everything.
   * Old objects never move; the board is infinite, so a place always exists.
   */
  function freeSpot(box: Box, excluded: ReadonlySet<string>): Point {
    const taken = occupied(excluded);
    const fits = (position: Point) => !taken.some((other) => intersects(translate(box, position), other));
    if (!cursor && fits(origin)) return origin;
    const everything = union(taken);
    const candidates: Point[] = [];
    // The latest composition was erased: the new one takes its place, where the camera already is.
    if (cursor) candidates.push([cursor.x0 - box.x0, cursor.y1 - box.y1]);
    // Within a tranche, below or beside: whichever keeps the tranche closest to the screen's shape,
    // so the camera can show it whole at a readable size (a graph with its calculations beside it).
    const tranche = union([...added.keys()].flatMap((id) => {
      const item = objects.get(id);
      return item && !excluded.has(id) ? [body(item, "layout_bounds")] : [];
    }));
    // A new tranche whose place the lesson has just cleared in front of the student (fade_out, remove,
    // move to a corner): it goes right there, in the middle of what is seen, next to what was kept aside.
    if (!tranche && cursor) {
      const screen = visibleArea(state);
      const [sx, sy] = center(screen);
      const [bx, by] = center(box);
      const middle: Point = [sx - bx, sy - by];
      const shown = [...objects.entries()].flatMap(([id, item]) =>
        excluded.has(id) || item.removed || item.faded ? [] : [body(item, "layout_bounds")]);
      const placed = translate(box, middle);
      if (inside(screen, placed) && !shown.some((other) => intersects(placed, other))) return middle;
      // The middle is taken: next to what the lesson keeps in view, so the camera can show both at a readable size.
      const keptBoxes = keptInView(state).flatMap((id) => {
        const item = objects.get(id);
        return item ? [body(item, "layout_bounds")] : [];
      });
      if (keptBoxes.length) {
        const width = state.initialViewport.x1 - state.initialViewport.x0, height = state.initialViewport.y1 - state.initialViewport.y0;
        const score = (position: Point) => {
          const all = union([...keptBoxes, translate(box, position)])!;
          return Math.min(width / Math.max(all.x1 - all.x0, 0.1), height / Math.max(all.y1 - all.y0, 0.1));
        };
        // Free places on a grid around what is kept; the best is the one the camera can show with it at the largest zoom.
        const around = union(keptBoxes)!;
        const w = box.x1 - box.x0, h = box.y1 - box.y0, step = 0.5;
        let best: Point | undefined;
        let bestScore = -1;
        for (let x = around.x0 - w - blockGap; x <= around.x1 + blockGap; x += step) {
          for (let y = around.y1 + blockGap; y >= around.y0 - h - blockGap; y -= step) {
            const position: Point = [x - box.x0, y - box.y1];
            if (!fits(position)) continue;
            const value = score(position);
            if (value > bestScore + 1e-9) { best = position; bestScore = value; }
          }
        }
        if (best) return best;
      }
    }
    const { initialViewport: view } = state;
    const fit = (position: Point) => {
      if (!tranche) return 0;
      const all = union([tranche, translate(box, position)])!;
      return Math.min((view.x1 - view.x0) / Math.max(all.x1 - all.x0, 0.1), (view.y1 - view.y0) / Math.max(all.y1 - all.y0, 0.1));
    };
    for (const near of [cursor, everything]) {
      if (!near) continue;
      const pair: Point[] = [beside(box, near, "down", blockGap, "left"), beside(box, near, "right", blockGap, "top")];
      candidates.push(...(tranche ? pair.sort((a, b) => fit(b) - fit(a)) : pair));
    }
    for (const candidate of candidates) if (fits(candidate)) return candidate;
    // Last resort: further down from the area below everything.
    let [x, y] = everything ? beside(box, everything, "down", blockGap, "left") : origin;
    for (let i = 0; i < 400; i++) {
      y -= blockGap;
      if (fits([x, y])) return [x, y];
    }
    throw new Error("Aucun placement disponible.");
  }

  /**
   * The frame a figure draws in. Figures of a tranche without their own placement
   * share one; `frame` joins an existing one; a placed figure roots its own.
   */
  function frameOf(definition: SceneObject, depth = 0): string | undefined {
    if (!FIGURE_TYPES.has(definition.type)) return undefined;
    if (definition.layout || definition.attachment) return definition.id;
    if (definition.frame && depth < 16) {
      const joined = added.get(definition.frame);
      if (joined) return frameOf(joined, depth + 1) ?? definition.frame;
      return objects.get(definition.frame)?.frame ?? definition.frame;
    }
    return `slice:${slice.slice_id}`;
  }

  /** The axes' area for a curve drawn on them (with a small margin), in the frame's coordinates. */
  function windowOf(definition: SceneObject): Box | undefined {
    if (definition.type !== "function_graph" && definition.type !== "parametric_curve") return undefined;
    const key = frameOf(definition);
    const axes = [...added.values()].find((item) => item.type === "axes" && frameOf(item) === key)
      ?? [...objects.values()].find((item) => item.definition.type === "axes" && item.frame === key && !item.removed)?.definition;
    if (axes?.type !== "axes") return undefined;
    const { x: [x0, x1], y: [y0, y1] } = axes.params ?? { x: [-6, 6], y: [-4, 4] };
    const mx = (x1 - x0) * 0.03, my = (y1 - y0) * 0.03;
    return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my };
  }

  /** World offset of a frame: computed once, for all its figures together, in a free place. */
  function frameOffset(key: string): Point {
    const known = frames.get(key);
    if (known) return known;
    if (added.has(key) || objects.has(key)) return placeObject(key).position;
    const members = [...added.values()].filter((definition) => frameOf(definition) === key);
    const box = union(members.map((definition) => {
      const measured = measureValid(measure, definition, values, state.math, windowOf(definition));
      return measured.reserve ?? measured.body;
    }));
    if (!box) return origin;
    const position = freeSpot(box, new Set(members.map(({ id }) => id)));
    frames.set(key, position);
    cursor = translate(box, position);
    return position;
  }

  function boundsOf(id: string): Box {
    complete(id);
    const box = boundsFor(next, [id], "layout_bounds", children);
    if (!box) throw new Error(`Encombrement indisponible « ${id} ».`);
    return box;
  }

  function placeWithLayout(box: Box, layout: Layout, excluded: ReadonlySet<string>): Point {
    if ("to_edge" in layout || "to_corner" in layout) return placeOnScreen(state, box, layout, obstacles(excluded), gap);
    const target = "next_to" in layout ? layout.next_to : "align_to" in layout ? layout.align_to : layout.center_on;
    const reference = "center_on" in layout && target === "initial_viewport" ? state.initialViewport : boundsOf(target);
    const position = positionFor(box, reference, layout, gap);
    if ("center_on" in layout) {
      return layout.center_on === "initial_viewport" ? avoidOverlap(box, position, obstacles(excluded), 0, gap) : position;
    }
    if ("align_to" in layout) {
      const axis = layout.align === "top" || layout.align === "bottom" ? 0 : 1;
      return avoidOverlap(box, position, obstacles(excluded), axis, gap);
    }
    return avoidBeside(box, position, layout.direction, excluded);
  }

  function avoidBeside(box: Box, position: Point, direction: NonNullable<Group["arrange"]>["direction"], excluded: ReadonlySet<string>): Point {
    const axis = direction === "left" || direction === "right" ? 0 : 1;
    return avoidOverlap(box, position, obstacles(excluded), axis, gap, direction === "left" || direction === "down" ? -1 : 1);
  }

  function placeObject(id: string): PlacedObject {
    const previous = objects.get(id);
    if (previous) return previous;
    const definition = added.get(id);
    if (!definition || positioning.has(id)) throw new Error(`Placement impossible pour « ${id} ».`);
    positioning.add(id);
    const window = windowOf(definition);
    const measurement = measureValid(measure, definition, values, state.math, window);
    const local = measurement.reserve ?? measurement.body;
    const frame = frameOf(definition);
    let position = origin;
    let leader: PlacedObject["leader"];
    if (definition.attachment) {
      if (definition.layout) throw new Error(`Le placement de « ${id} » a deux références.`);
      const { parent: parentId, placement } = definition.attachment;
      const group = groups.get(parentId);
      const parent = group ? undefined : placeObject(parentId);
      const parentBox = parent ? body(parent, "render_bounds") : boundsFor(next, group!.items, "layout_bounds", children);
      if (!parentBox) throw new Error(`Encombrement indisponible « ${parentId} ».`);
      const anchored = attachmentPosition(definition, local, parent, parentBox, state.minGap);
      const excluded = new Set([id, parentId]);
      if (placement === "inside") for (const target of descendants(parentId, groups, new Map())) excluded.add(target);
      const around = obstacles(excluded);
      position = avoidOverlap(local, anchored.position, around, anchored.axis, gap);
      // A label of a small mark (a point on a curve) pushed away: first the other sides of its point, close to it.
      // Seen in a real lesson (2026-11-09): the zeros' labels slid along the x axis's numbers to its ends.
      let nextToParent = false;
      if (placement !== "inside" && position !== anchored.position) {
        const closer = besideSmallParent(local, parentBox, gapSize(definition.attachment.gap ?? state.minGap), definition.attachment.anchor, around);
        if (closer) {
          position = closer;
          nextToParent = true;
        }
      }
      if (placement !== "inside" && position !== anchored.position && !nextToParent) {
        leader = leaderFor(anchored.anchor, translate(measurement.body, position));
      }
    } else if (definition.layout) {
      position = placeWithLayout(local, definition.layout, new Set([id]));
    } else if (morphSource.has(id) && (objects.has(currentId(state, morphSource.get(id)!)) || added.has(morphSource.get(id)!))) {
      // An earlier tranche may have replaced the source already: the formula standing there now is the reference.
      const sourceId = currentId(state, morphSource.get(id)!);
      const source = boundsOf(sourceId);
      // Left edges together, centred in height. Only what this formula replaces may be covered:
      // its source and the earlier steps of the same chain (e1 → e2 → e3), with their labels.
      const replaced = new Set([id]);
      for (let step: string | undefined = sourceId; step && !replaced.has(step); step = morphSource.get(step)) {
        for (const member of descendants(step, groups, children)) replaced.add(member);
      }
      const wanted: Point = [source.x0 - local.x0, (source.y0 + source.y1) / 2 - (local.y0 + local.y1) / 2];
      position = avoidOverlap(local, wanted, obstacles(replaced), 1, gap, -1);
    } else if (frame) {
      position = frameOffset(frame);
    } else if (!measurement.allowOverlap && ["text", "math", "label", "callout", "matrix"].includes(definition.type)) {
      position = freeSpot(local, new Set([id]));
      cursor = translate(local, position);
    }
    // A figure placed by a relation roots a frame that later figures may join.
    if (frame === id) frames.set(id, position);
    const placed = { definition, position, measurement, visible: false, leader, ...(frame ? { frame } : {}), ...(window ? { window } : {}) };
    checkBox(body(placed, "layout_bounds"));
    objects.set(id, placed);
    positioning.delete(id);
    return placed;
  }

  function shift(ids: ReadonlySet<string>, [x, y]: Point): void {
    if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return;
    for (const id of ids) {
      const object = objects.get(id);
      if (!object) continue;
      if (state.objects.has(id)) throw new Error(`Le groupe déplacerait l’objet déjà placé « ${id} ».`);
      const parent = object.definition.attachment?.parent;
      if (parent && !ids.has(parent)) throw new Error(`Le groupe détacherait « ${id} » de son parent.`);
      const move = ([px, py]: Point): Point => [px + x, py + y];
      const moved = {
        ...object, position: move(object.position),
        leader: object.leader && { from: move(object.leader.from), to: move(object.leader.to) },
      };
      checkBox(body(moved, "layout_bounds"));
      objects.set(id, moved);
    }
  }

  function complete(id: string): void {
    if (completed.has(id)) return;
    const parent = added.get(id)?.attachment?.parent;
    const owner = owners.get(id) ?? (parent && groups.has(parent) ? parent : undefined);
    if (owner && !resolving.has(owner)) {
      complete(owner);
      return;
    }
    if (resolving.has(id)) throw new Error(`Dépendance de placement cyclique autour de « ${id} ».`);
    resolving.add(id);
    const group = groups.get(id);
    if (group) {
      let previous: Box | undefined;
      const arrange = state.groups.has(id) ? undefined : group.arrange;
      const groupMembers = descendants(id, groups, children);
      for (const member of group.items) {
        const box = boundsOf(member);
        if (previous && arrange) {
          const position = beside(box, previous, arrange.direction, gapSize(arrange.gap ?? state.minGap), arrange.align);
          // All members move as a unit below when the group has an explicit layout.
          const delta = group.layout ? position : avoidBeside(box, position, arrange.direction, groupMembers);
          shift(descendants(member, groups, children), delta);
        }
        previous = boundsFor(next, [member], "layout_bounds", children) ?? undefined;
      }
      if (group.layout && !state.groups.has(id)) {
        const box = boundsFor(next, [id], "layout_bounds", children);
        if (box) shift(groupMembers, placeWithLayout(box, group.layout, groupMembers));
      }
    } else {
      placeObject(id);
    }
    for (const child of children.get(id) ?? []) complete(child);
    completed.add(id);
    resolving.delete(id);
  }

  for (const id of added.keys()) complete(id);
  for (const group of slice.groups ?? []) complete(group.id);
  const kept = new Set(state.kept);
  for (const item of [...slice.introduces, ...slice.groups ?? []]) {
    if (item.layout && ("to_edge" in item.layout || "to_corner" in item.layout)) kept.add(item.id);
  }
  const slices = new Map(state.slices).set(slice.slice_id, new Set(slice.beats.map(({ id }) => id)));
  const placedNow = union([...added.keys()].map((id) => {
    const object = objects.get(id);
    return object ? body(object, "layout_bounds") : null;
  }));
  return { ...next, slices, frames, kept, lastComposition: placedNow ?? state.lastComposition };
}

/** What the student sees now: the camera's destination if it is moving. */
export function visibleArea(state: SceneState): Box {
  return cameraView(state, state.camera.target_state ?? state.camera.state);
}

/**
 * to_edge / to_corner, resolved once against the visible area. A box with no place
 * yet starts from the centre of the view; on an edge it slides along it if something is there.
 */
function placeOnScreen(
  state: SceneState, box: Box, layout: Extract<Layout, { to_edge: unknown } | { to_corner: unknown }>, taken: readonly Box[], gap: number, from?: Point,
): Point {
  const view = visibleArea(state);
  const [vx, vy] = center(view);
  const [bx, by] = center(box);
  const start: Point = from ?? [vx - bx, vy - by];
  const [dx, dy] = positionFor(translate(box, start), view, layout, gap);
  const wanted: Point = [start[0] + dx, start[1] + dy];
  const alongVertical = "to_edge" in layout ? layout.to_edge === "left" || layout.to_edge === "right" : true;
  const inward = "to_corner" in layout && layout.to_corner.startsWith("top") ? -1 : 1;
  return avoidOverlap(box, wanted, taken, alongVertical ? 1 : 0, gap, "to_corner" in layout ? inward : 0);
}

/** What a moved object must not land on: what is on the board now (strokes for figures). */
function boardObstacles(state: SceneState, excluded: ReadonlySet<string>): Box[] {
  return [...state.objects].flatMap(([id, item]) => {
    if (excluded.has(id) || item.removed || !item.visible) return [];
    if (item.measurement.collision) return item.measurement.collision.map((box) => translate(box, item.position));
    return item.measurement.allowOverlap ? [] : [body(item, "layout_bounds")];
  });
}

/** What `move` carries: the object, its group members and labels; axes take every figure of their frame. */
export function movedObjects(state: SceneState, target: string): string[] {
  const ids = new Set(clearedObjects(state, target));
  for (const id of [...ids]) {
    const item = state.objects.get(id);
    if (item?.definition.type !== "axes" || !item.frame) continue;
    for (const [other, placed] of state.objects) {
      if (placed.frame === item.frame && !placed.removed) for (const member of clearedObjects(state, other)) ids.add(member);
    }
  }
  return [...ids];
}

/** Total shift of a `move`, computed once from the board as it is when the gesture starts. */
export function moveShift(state: SceneState, target: string, to: Layout): { ids: string[]; shift: Point } {
  const ids = movedObjects(state, target);
  const box = union(ids.map((id) => {
    const item = state.objects.get(id)!;
    return body(item, "layout_bounds");
  }));
  if (!box) return { ids, shift: [0, 0] };
  const gap = gapSize(state.minGap);
  const taken = boardObstacles(state, new Set(ids));
  if ("to_edge" in to || "to_corner" in to) {
    const placed = placeOnScreen(state, box, to, taken, gap, [0, 0]);
    return { ids, shift: placed };
  }
  const reference = "center_on" in to && to.center_on === "initial_viewport"
    ? visibleArea(state)
    : sceneBounds(state, ["next_to" in to ? to.next_to : "align_to" in to ? to.align_to : to.center_on], "layout_bounds");
  if (!reference) return { ids, shift: [0, 0] };
  const wanted = positionFor(box, reference, to, gap);
  const axis = "next_to" in to ? (to.direction === "left" || to.direction === "right" ? 1 : 0) : 1;
  return { ids, shift: avoidOverlap(box, wanted, taken, axis, gap) };
}

/** Shifts objects (and the frames they carry) by `shift`. */
export function shiftObjects(state: SceneState, ids: readonly string[], [x, y]: Point): SceneState {
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return state;
  const objects = new Map(state.objects);
  const frames = new Map(state.frames);
  const move = ([px, py]: Point): Point => [px + x, py + y];
  for (const id of ids) {
    const item = objects.get(id);
    if (!item) continue;
    objects.set(id, { ...item, position: move(item.position), leader: item.leader && { from: move(item.leader.from), to: move(item.leader.to) } });
    if (item.definition.type === "axes" && item.frame && frames.has(item.frame)) frames.set(item.frame, move(frames.get(item.frame)!));
    else if (item.frame === id && frames.has(id)) frames.set(id, move(frames.get(id)!));
  }
  return { ...state, objects, frames };
}

export function beginBeat(state: SceneState, slice: string, beat: string): SceneState {
  if (!state.slices.get(slice)?.has(beat)) throw new Error(`Beat absent « ${slice}/${beat} ».`);
  return { ...state, currentSlice: slice, currentBeat: beat };
}

export function setVisibility(state: SceneState, target: string, visible: boolean): SceneState {
  if (!state.objects.has(target) && !state.groups.has(target)) throw new Error(`Cible absente « ${target} ».`);
  const objects = new Map(state.objects);
  // Attachments have their own reveal actions. Revealing a group reveals its explicit members.
  for (const id of descendants(target, state.groups, new Map())) {
    const item = objects.get(id);
    if (item && !item.removed && (item.visible !== visible || item.revealedParts || item.dimmed || item.faded)) {
      const { revealedParts: _, dimmed: __, faded: ___, ...whole } = item;
      objects.set(id, { ...whole, visible });
    }
  }
  return { ...state, objects };
}

/**
 * Objects that leave with a target when the board is cleared: a group's members
 * and, unlike a reveal, the labels attached to them — a label never outlives its object.
 */
export function clearedObjects(state: SceneState, target: string): string[] {
  const children = childrenOf([...state.objects.values()].map(({ definition }) => definition));
  return [...descendants(target, state.groups, children)].filter((id) => state.objects.has(id) && !state.objects.get(id)!.removed);
}

/** `dim` steps objects back; they stay visible. `show` brings them forward again. */
export function setDimmed(state: SceneState, target: string, dimmed: boolean): SceneState {
  const objects = new Map(state.objects);
  for (const id of clearedObjects(state, target)) {
    const item = objects.get(id)!;
    if (item.visible && Boolean(item.dimmed) !== dimmed) objects.set(id, { ...item, dimmed });
  }
  return { ...state, objects };
}

/** `fade_out` hides objects and keeps their place; `remove` also frees it for good. */
export function clearTarget(state: SceneState, target: string, remove: boolean): SceneState {
  const objects = new Map(state.objects);
  for (const id of clearedObjects(state, target)) {
    const { revealedParts: _, dimmed: __, ...item } = objects.get(id)!;
    objects.set(id, { ...item, visible: false, ...(remove ? { removed: true } : { faded: true }) });
  }
  return { ...state, objects };
}

/** Writes one part of a formula. The object becomes whole again once every part is written. */
export function revealPart(state: SceneState, target: string, part: string): SceneState {
  const item = state.objects.get(target);
  if (!item || item.definition.type !== "math" || !item.definition.parts?.some(({ id }) => id === part)) {
    throw new Error(`Partie absente « ${target}#${part} ».`);
  }
  if (partVisible(item, part)) return state;
  const revealed = new Set(item.visible ? item.revealedParts : []);
  revealed.add(part);
  const objects = new Map(state.objects);
  const { revealedParts: _, ...whole } = item;
  objects.set(target, revealed.size === item.definition.parts.length
    ? { ...whole, visible: true }
    : { ...whole, visible: true, revealedParts: revealed });
  return { ...state, objects };
}

export function targetObjects(state: SceneState, target: string): string[] {
  return [...descendants(target, state.groups, new Map())].filter((id) => state.objects.has(id));
}

/** Remeasure geometry without moving unrelated objects. Reject an unreserved collision atomically. */
export function setParameter(state: SceneState, id: string, value: number, measure = measureSceneObject): SceneState {
  const parameter = Object.hasOwn(state.math.symbols, id) ? state.math.symbols[id] : undefined;
  if (parameter?.kind !== "parameter" || !Number.isFinite(value) || value < parameter.min || value > parameter.max) {
    throw new Error(`Valeur hors de l’intervalle du paramètre « ${id} ».`);
  }
  if (state.parameters.get(id) === value) return state;
  const objects = new Map<string, PlacedObject>();
  const next = { ...state, parameters: new Map(state.parameters).set(id, value), objects };
  const values = symbolValues(next);
  const children = childrenOf([...state.objects.values()].map(({ definition }) => definition));
  const resolving = new Set<string>();
  const checkedGroups = new Set<string>();

  function refresh(target: string): void {
    if (objects.has(target) || checkedGroups.has(target)) return;
    if (resolving.has(target)) throw new Error(`Dépendance dynamique cyclique autour de « ${target} ».`);
    resolving.add(target);
    const group = state.groups.get(target);
    if (group) {
      for (const member of group.items) {
        for (const descendant of descendants(member, state.groups, children)) refresh(descendant);
      }
      checkedGroups.add(target);
    } else {
      const previous = state.objects.get(target);
      if (!previous) throw new Error(`Objet absent « ${target} ».`);
      const { definition } = previous;
      const measurement = measureValid(measure, definition, values, state.math, previous.window);
      let position = previous.position;
      let leader = previous.leader;
      if (definition.attachment) {
        const parentId = definition.attachment.parent;
        refresh(parentId);
        const beforeParent = state.objects.get(parentId);
        const afterParent = objects.get(parentId);
        const members = state.groups.get(parentId)?.items ?? [];
        const beforeBounds = beforeParent ? body(beforeParent, "render_bounds") : boundsFor(state, members, "layout_bounds", children);
        const afterBounds = afterParent ? body(afterParent, "render_bounds") : boundsFor(next, members, "layout_bounds", children);
        if (!beforeBounds || !afterBounds) throw new Error(`Encombrement indisponible « ${parentId} ».`);
        const before = attachmentPosition(definition, previous.measurement.reserve ?? previous.measurement.body, beforeParent, beforeBounds, state.minGap).position;
        const after = attachmentPosition(definition, measurement.reserve ?? measurement.body, afterParent, afterBounds, state.minGap);
        position = [position[0] + after.position[0] - before[0], position[1] + after.position[1] - before[1]];
        if (leader) leader = leaderFor(after.anchor, translate(measurement.body, position));
      }
      const updated = { ...previous, position, measurement, leader };
      checkBox(body(updated, "layout_bounds"));
      objects.set(target, updated);
    }
    resolving.delete(target);
  }

  for (const target of state.objects.keys()) refresh(target);
  const placed = [...objects.values()].filter((object) => !object.measurement.allowOverlap && !object.removed);
  for (const [index, a] of placed.entries()) {
    for (const b of placed.slice(index + 1)) {
      const previousA = state.objects.get(a.definition.id)!;
      const previousB = state.objects.get(b.definition.id)!;
      if (intersects(body(a, "render_bounds"), body(b, "render_bounds"))
        && !intersects(body(previousA, "render_bounds"), body(previousB, "render_bounds"))) {
        const attached = (item: PlacedObject, parent: PlacedObject) => {
          const attachment = item.definition.attachment;
          return attachment && (attachment.parent === parent.definition.id
            || (attachment.placement === "inside"
              && descendants(attachment.parent, state.groups, new Map()).has(parent.definition.id)));
        };
        if (!attached(a, b) && !attached(b, a)) {
          throw new Error(`Conflit dynamique entre « ${a.definition.id} » et « ${b.definition.id} ».`);
        }
      }
    }
  }
  return next;
}

export function withCameraState(state: SceneState, camera: RuntimeState["camera"]): SceneState {
  return { ...state, camera };
}

/**
 * Readability bounds of `keep_text_readable`. At zoom 1 text has its design size;
 * the camera never shows it smaller than `min` nor larger than `max` times that.
 */
export const CAMERA_ZOOM = { min: 0.6, max: 1.5 } as const;

export interface CameraFrame {
  state: RuntimeState["camera"]["state"];
  /** Targets left out of the frame because showing them all would make text unreadable. */
  hidden: string[];
}

export function inside(outer: Box, inner: Box): boolean {
  const e = 1e-6;
  return inner.x0 >= outer.x0 - e && inner.x1 <= outer.x1 + e && inner.y0 >= outer.y0 - e && inner.y1 <= outer.y1 + e;
}

/** The world area a camera state shows, with the design viewport's proportions. */
export function cameraView(state: SceneState, camera: RuntimeState["camera"]["state"]): Box {
  const { initialViewport: viewport } = state;
  const halfWidth = (viewport.x1 - viewport.x0) / (2 * camera.zoom);
  const halfHeight = (viewport.y1 - viewport.y0) / (2 * camera.zoom);
  return { x0: camera.x - halfWidth, x1: camera.x + halfWidth, y0: camera.y - halfHeight, y1: camera.y + halfHeight };
}

/**
 * Derive a camera target. The renderer reports its actual view separately.
 * When the targets cannot all be shown at a readable size, frame `priority`.
 * Kept objects join the chosen frame when they fit. Report what is left out.
 */
export function fitSceneCamera(
  state: SceneState, targets: readonly string[], mode: Bounds = "render_bounds",
  options: { padding?: number; priority?: readonly string[]; kept?: readonly string[]; avoidCutting?: boolean } = {},
): CameraFrame | null {
  const padding = options.padding ?? 0.9;
  const kept = (options.kept ?? []).filter((id) => !targets.includes(id));
  for (const id of [...targets, ...(options.priority ?? []), ...kept]) {
    if (!state.objects.has(id) && !state.groups.has(id)) throw new Error(`Cible absente « ${id} ».`);
  }
  // Axes are framed with what they carry (curves, points) and their labels (spec §10).
  const withFrames = (ids: readonly string[]) => {
    const frames = new Set(ids.map((id) => state.objects.get(id)).filter((item) => item?.definition.type === "axes").map((item) => item!.frame));
    // A figure is framed with the points drawn on it (same frame, inside its area) and so with their labels:
    // a curve's point keeps its label in view. A single point does not pull in the whole figure.
    const onFigures = ids.flatMap((id) => {
      const figure = state.objects.get(id);
      if (!figure?.frame || !FIGURE_TYPES.has(figure.definition.type) || figure.definition.type === "point") return [];
      const area = body(figure, "layout_bounds");
      const margin = { x0: area.x0 - 0.1, y0: area.y0 - 0.1, x1: area.x1 + 0.1, y1: area.y1 + 0.1 };
      return [...state.objects].filter(([other, item]) => other !== id && item.frame === figure.frame && item.definition.type === "point"
        && !item.removed && inside(margin, body(item, "layout_bounds"))).map(([other]) => other);
    });
    return [...new Set([...ids, ...onFigures, ...[...state.objects].filter(([, item]) => item.frame && frames.has(item.frame)).map(([id]) => id)])];
  };
  const box = sceneBounds(state, withFrames(targets), mode);
  if (!box) return null;
  const { initialViewport: viewport } = state;
  if (!Number.isFinite(padding) || padding <= 0 || padding > 1 || viewport.x0 >= viewport.x1 || viewport.y0 >= viewport.y1) {
    throw new Error("Dimensions de cadrage invalides.");
  }
  const width = viewport.x1 - viewport.x0;
  const height = viewport.y1 - viewport.y0;
  const fit = (target: Box) => padding * Math.min(width / Math.max(target.x1 - target.x0, 0.1), height / Math.max(target.y1 - target.y0, 0.1));
  let framed = box;
  if (fit(box) < CAMERA_ZOOM.min && options.priority?.length) {
    framed = sceneBounds(state, options.priority, "layout_bounds") ?? box;
  }
  for (const id of kept) {
    const candidate = union([framed, sceneBounds(state, withFrames([id]), mode)]);
    if (candidate && fit(candidate) >= CAMERA_ZOOM.min) framed = candidate;
  }
  const viewOf = (box: Box) => {
    const zoom = Math.min(CAMERA_ZOOM.max, Math.max(CAMERA_ZOOM.min, fit(box)));
    const [x, y] = center(box);
    return { zoom, x, y, view: { x0: x - width / (2 * zoom), x1: x + width / (2 * zoom), y0: y - height / (2 * zoom), y1: y + height / (2 * zoom) } };
  };
  if (options.avoidCutting) {
    // Seen in real generations: framing what appears cut a figure or formula still on the board in half.
    // An object the frame would cut joins it when everything stays readable; one left wholly outside stays out.
    // Not the figure a detail is taken from: zooming on a curve's point leaves the rest of the curve out.
    const targetFrames = new Set(withFrames(targets).map((id) => state.objects.get(id)?.frame).filter(Boolean));
    const shown = withFrames([...targets, ...kept]);
    const context = [...state.objects].filter(([id, item]) => item.visible && !item.removed && !shown.includes(id)
      && !(item.frame && targetFrames.has(item.frame)));
    // What still speaks first, then what was dimmed.
    for (const group of [context.filter(([, item]) => !item.dimmed), context.filter(([, item]) => item.dimmed)]) {
      for (let pass = 0; pass < 4; pass++) {
        const { view } = viewOf(framed);
        const cut = group.map(([id]) => sceneBounds(state, [id], "render_bounds"))
          .filter((box): box is Box => box !== null && box.x1 > view.x0 && box.x0 < view.x1 && box.y1 > view.y0 && box.y0 < view.y1 && !inside(view, box));
        let grew = false;
        for (const box of cut) {
          const candidate = union([framed, box]);
          if (candidate && fit(candidate) >= CAMERA_ZOOM.min) {
            framed = candidate;
            grew = true;
          }
        }
        if (!grew) break;
      }
    }
  }
  const { zoom, x, y, view } = viewOf(framed);
  const hidden = [...targets, ...kept].filter((id) => {
    const own = sceneBounds(state, [id], mode) ?? sceneBounds(state, [id], "layout_bounds");
    return own !== null && !inside(view, own);
  });
  return { state: { x, y, zoom }, hidden };
}

export function runtimeState(state: SceneState): RuntimeState {
  return {
    current_slice: state.currentSlice,
    current_beat: state.currentBeat,
    visible_objects: [...state.objects].filter(([, item]) => item.visible).map(([id]) => id),
    objects: [...state.objects].filter(([, item]) => !item.removed).map(([id, item]) => ({
      id, type: item.definition.type, visible: item.visible,
      ...(item.revealedParts ? { visible_parts: [...item.revealedParts] } : {}),
    })),
    groups: [...state.groups.values()].map(({ id, items }) => ({ id, items: [...items] })),
    camera: state.camera,
    parameters: Object.fromEntries(state.parameters),
  };
}
