/**
 * The camera of a whole tranche, planned at once when the tranche arrives.
 *
 * Until 2026-11-10 the engine decided passage by passage (`anticipate`): frame what is coming, move if it is out of
 * frame or badly composed. Each choice was right for its passage and wrong for the next ones: recentring a passage
 * cost a movement that the following passage undid. A tranche's whole content is known when it arrives (objects,
 * places, the order in which they appear and leave), so the framing of every passage is chosen together, the way
 * video stabilisation plans a whole camera path (Grundmann, Kwatra, Essa, CVPR 2011) rather than correcting each frame:
 * hold still as long as the picture stays good, move once, gently, when it no longer does.
 *
 * Method: for each passage, candidate framings are what the passage shows, alone or with what the next passages
 * show (up to the end of the tranche), plus the view the tranche starts with. A path through the passages is chosen
 * by dynamic programming (Viterbi), at the lowest total cost:
 *   - a new object outside the frame when it appears: forbidden in practice (heavy cost);
 *   - an object cut by the edge: 8 each;
 *   - a picture off-centre, or small in a screen the camera stepped back from: 12 per unit of flaw (`composition`);
 *   - a movement: 1, plus 2 per screen travelled, plus 2 per factor e of zoom; holding still: 0.
 * Only the choice of what to frame is planned here; the movement itself (duration, path, end at the first new
 * object) is the engine's as before. A passage where the lesson moves the camera itself (camera.focus,
 * camera.restore) ends the plan: the passages after it are framed as before, one by one.
 */
import type { Action, Slice } from "@/domain/nesalio/contract";
import type { Box } from "@/domain/nesalio/placement";
import { cameraView, currentId, fitSceneCamera, inside, keptInView, sceneBounds, targetObjects, type CameraFrame, type SceneState } from "@/domain/nesalio/sceneState";

type CameraState = CameraFrame["state"];

/** What a passage is told to do with the camera: frame these targets, or hold the view it has. */
export type PlannedFraming = { targets: string[] } | "hold";

export const COMPOSITION = { fill: 0.45, offCenter: 0.2 } as const;

/**
 * Composition of a picture, after 3Blue1Brown: what is shown fills the screen (at least COMPOSITION.fill of its width
 * or height) and stands near its centre (within COMPOSITION.offCenter of a screen).
 */
export function composition(view: Box, shown: Box): { fill: number; offset: number; good: boolean } {
  const width = view.x1 - view.x0, height = view.y1 - view.y0;
  const x0 = Math.max(shown.x0, view.x0), x1 = Math.min(shown.x1, view.x1), y0 = Math.max(shown.y0, view.y0), y1 = Math.min(shown.y1, view.y1);
  const fill = Math.max((x1 - x0) / width, (y1 - y0) / height);
  const offset = Math.max(Math.abs((x0 + x1) / 2 - (view.x0 + view.x1) / 2) / width, Math.abs((y0 + y1) / 2 - (view.y0 + view.y1) / 2) / height);
  return { fill, offset, good: fill >= COMPOSITION.fill && offset <= COMPOSITION.offCenter };
}

const REVEALS = new Set(["show", "draw", "write", "transform"]);
const LEAVES = new Set(["fade_out", "remove"]);
const overlaps = (a: Box, b: Box) => a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;

export const PLAN_COST = { hidden: 100, cut: 8, flaw: 12, move: 1, travel: 2, zoom: 2 } as const;

interface Passage {
  id: string;
  /** Appearing in this passage. */
  reveals: string[];
  /** On the board at the end of this passage, what appeared in it included. */
  shown: string[];
  /** Erased in this passage. */
  leaving: Set<string>;
}

/** The passages of a tranche as the board will go through them, up to the first one where the lesson moves the camera. */
function passagesOf(scene: SceneState, slice: Slice): Passage[] {
  const visible = new Set([...scene.objects].filter(([, item]) => item.visible && !item.faded && !item.removed).map(([id]) => id));
  const passages: Passage[] = [];
  const expand = (target: string) => targetObjects(scene, currentId(scene, target)).filter((id) => scene.objects.has(id));
  for (const beat of slice.beats) {
    if (beat.do.some((action) => action.verb === "camera.focus" || action.verb === "camera.restore")) break;
    const reveals: string[] = [];
    const leaving = new Set<string>();
    for (const action of beat.do as Action[]) {
      if (REVEALS.has(action.verb) && "target" in action) for (const id of expand(action.target)) if (!visible.has(id)) reveals.push(id);
      if (action.verb === "transform") for (const id of expand(action.source)) leaving.add(id);
      if (LEAVES.has(action.verb) && "target" in action) for (const id of expand(action.target)) leaving.add(id);
    }
    for (const id of reveals) visible.add(id);
    for (const id of leaving) if (!reveals.includes(id)) visible.delete(id);
    passages.push({ id: beat.id, reveals: [...new Set(reveals)], shown: [...visible], leaving });
  }
  return passages;
}

/** Plans the framing of each passage of a tranche just introduced (`introduceSlice`). Empty when there is nothing to plan. */
export function planTranche(scene: SceneState, slice: Slice, padding: number, maxZoom: number): Map<string, PlannedFraming> {
  const passages = passagesOf(scene, slice);
  const plan = new Map<string, PlannedFraming>();
  if (!passages.some(({ reveals }) => reveals.length)) return plan;
  const width = scene.initialViewport.x1 - scene.initialViewport.x0;
  const start = scene.camera.target_state ?? scene.camera.state;
  const kept = keptInView(scene);
  // What the tranche talks about: its own objects and those the lesson keeps in view, with the axes they are drawn
  // on. What earlier tranches left on the board is not aimed at (it may stay out of frame), only never cut.
  const own = new Set([...slice.introduces.map(({ id }) => id), ...kept]);
  const frames = (ids: Iterable<string>) => new Set([...ids].map((id) => scene.objects.get(id)?.frame).filter(Boolean));
  const aimed = (ids: Iterable<string>) => {
    const list = [...ids].filter((id) => own.has(id));
    const shared = frames(list);
    const axes = [...scene.objects].filter(([, item]) => item.definition.type === "axes" && !item.removed && item.frame && shared.has(item.frame)).map(([id]) => id);
    return [...new Set([...list, ...axes])];
  };

  // The pool of framings: the starting view, and what passages k to j show, for every k ≤ j.
  const pool: { targets: string[] | null; state: CameraState }[] = [{ targets: null, state: start }];
  const seen = new Set<string>();
  for (let k = 0; k < passages.length; k++) {
    if (!passages[k]!.reveals.length) continue;
    const union = new Set<string>();
    for (let j = k; j < passages.length; j++) {
      for (const id of aimed(passages[j]!.shown)) union.add(id);
      const targets = [...union];
      if (!targets.length) continue;
      const key = targets.slice().sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      let fitted;
      try {
        fitted = fitSceneCamera(scene, targets, "layout_bounds", { padding, kept, avoidCutting: true, leaving: passages[k]!.leaving, maxZoom });
      } catch { fitted = null; }
      if (fitted && !fitted.hidden.some((id) => passages[k]!.reveals.includes(id))) pool.push({ targets, state: fitted.state });
    }
  }

  const boxOf = (id: string) => sceneBounds(scene, [id], "layout_bounds");
  const stay = (passage: Passage, state: CameraState) => {
    const view = cameraView(scene, state);
    let cost = 0;
    for (const id of passage.reveals) {
      const box = boxOf(id);
      if (box && !inside(view, box)) cost += PLAN_COST.hidden;
    }
    const boxes: Box[] = [];
    for (const id of passage.shown) {
      const box = boxOf(id);
      if (!box || !overlaps(box, view)) continue;
      if (!inside(view, box)) cost += PLAN_COST.cut;
      boxes.push(box);
    }
    if (boxes.length) {
      const shown = boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
      const { fill, offset } = composition(view, shown);
      cost += PLAN_COST.flaw * ((state.zoom < 1 - 1e-6 ? Math.max(0, COMPOSITION.fill - fill) : 0) + Math.max(0, offset - COMPOSITION.offCenter));
    }
    return cost;
  };
  const move = (from: CameraState, to: CameraState) => {
    const screen = width / from.zoom;
    const distance = Math.hypot(to.x - from.x, to.y - from.y) / screen;
    const zoom = Math.abs(Math.log(to.zoom / from.zoom));
    // Under a tenth of a screen and ×0.9 to ×1.1: not worth a movement (the engine would not make it).
    if (distance < 0.1 && zoom < Math.log(1.1)) return 0;
    return PLAN_COST.move + PLAN_COST.travel * distance + PLAN_COST.zoom * zoom;
  };

  // Viterbi: best[c] = lowest cost of a path ending at framing c after the current passage.
  let best = pool.map((candidate) => move(start, candidate.state));
  const back: number[][] = [];
  passages.forEach((passage, k) => {
    const here = pool.map((candidate) => stay(passage, candidate.state));
    if (k === 0) { best = best.map((cost, c) => cost + here[c]!); back.push(pool.map(() => -1)); return; }
    const next: number[] = [];
    const from: number[] = [];
    pool.forEach((candidate, c) => {
      let low = Infinity, arg = c;
      best.forEach((cost, p) => {
        const total = cost + (p === c ? 0 : move(pool[p]!.state, candidate.state));
        if (total < low - 1e-9) { low = total; arg = p; }
      });
      next.push(low + here[c]!);
      from.push(arg);
    });
    best = next;
    back.push(from);
  });
  let c = best.reduce((arg, cost, i) => (cost < best[arg]! ? i : arg), 0);
  const path: number[] = [];
  for (let k = passages.length - 1; k >= 0; k--) { path[k] = c; c = back[k]![c]!; if (c < 0) c = path[k]!; }
  let previous: CameraState = start;
  passages.forEach((passage, k) => {
    const candidate = pool[path[k]!]!;
    plan.set(passage.id, candidate.targets === null || move(previous, candidate.state) === 0 ? "hold" : { targets: candidate.targets });
    previous = candidate.targets === null || move(previous, candidate.state) === 0 ? previous : candidate.state;
  });
  return plan;
}
