import { interpolateZoom } from "d3-interpolate";
import { pausableSleep, whenRunning, type PlaybackControl } from "./nesalioControl";
import { COMPOSITION, composition, planTranche, type PlannedFraming } from "./tranchePlan";
import { negotiateCapabilities, schemaCapabilities, type Capabilities } from "@/domain/nesalio/capabilities";
import type { Action, Beat, Role, Slice } from "@/domain/nesalio/contract";
import type { LessonDocument, LessonHeader } from "@/domain/nesalio/lesson";
import { parametersOf } from "@/domain/nesalio/measurement";
import { sampleBeat, scheduleBeat, type BeatSchedule, type CueTiming, type ScheduledAction } from "@/domain/nesalio/scheduler";
import {
  beginBeat, cameraView, clearTarget, clearedObjects, createScene, currentId, inside, keptInView, moveShift, shiftObjects, fitSceneCamera, introduceSlice, partVisible, revealPart, sceneBounds, setDimmed,
  setParameter, setVisibility, symbolValues,
  CAMERA_ZOOM, targetObjects, withCameraState, withMathContext, type CameraFrame, type MeasureObject, type SavedCameraFrame, type SceneState,
} from "@/domain/nesalio/sceneState";
import type { Box } from "@/domain/nesalio/placement";

type Style = typeof Role._output;
type Reveal = { key: string; verb: "show" | "draw" | "write"; progress: number };
type Focus = Extract<Action, { verb: "camera.focus" }>;
type CameraTiming = Pick<Focus, "transition" | "pace">;
type FramingIntent = Pick<SavedCameraFrame, "targets" | "bounds">;
type CameraState = CameraFrame["state"];
type CameraMove = CameraFrame & { path?: (t: number) => CameraState };
type PlannedCamera = { move?: CameraMove; saved?: SavedCameraFrame; warning?: string };
export interface NesalioFrame {
  scene: SceneState;
  reveals: ReadonlyMap<string, Reveal>;
  /** Formula id → part id → write in progress. */
  partReveals: ReadonlyMap<string, ReadonlyMap<string, { key: string; progress: number }>>;
  styles: ReadonlyMap<string, Style>;
  highlights: ReadonlyMap<string, { role: Style; progress: number }>;
  /** Formula id → part id → passing highlight of that part only. */
  partHighlights: ReadonlyMap<string, ReadonlyMap<string, { role: Style; progress: number }>>;
  /** Opacity of objects fading (dim, fade_out, remove, or back from dim). Others: 1, or `DIM_OPACITY` when dimmed. */
  opacity: ReadonlyMap<string, number>;
  /** Source formula id → the morph in progress into `target` (the source is drawn by the morph, not as itself). */
  morphs: ReadonlyMap<string, { key: string; target: string; progress: number }>;
}

/** How visible a dimmed object stays: readable when the lesson points back to it, but clearly in the background. */
// 0.3 until 2026-11-09: a dimmed label had a contrast of 1.5 to 1.9 on the paper, nearly unreadable (seen in a real
// lesson). 0.5 gives 2.1 to 3.1: clearly in the background, still readable when the lesson points back to it.
export const DIM_OPACITY = 0.5;

export interface NesalioClip {
  readonly durationMs: number;
  readonly cues: ReadonlyMap<string, CueTiming>;
  /** `control`: pause and mute from the page; the voice stops, restarts and goes silent with it. */
  play(draw: (playhead: number) => void, signal: AbortSignal, control?: PlaybackControl): Promise<void>;
  dispose(): void;
}

/** What this player can execute. The generator's prompt and checks offer nothing beyond it. */
export const PLAYABLE: Capabilities = {
  objects: schemaCapabilities.objects,
  actions: new Set(["show", "draw", "write", "highlight", "set_style", "dim", "fade_out", "remove", "transform", "move", "camera.focus", "camera.restore", "animate_parameter"]),
};
const playable = PLAYABLE;

function durationOf(action: Action): number {
  // Implicit camera durations are filled in when their start view is known.
  if (action.verb === "camera.focus" || action.verb === "camera.restore") return 0;
  if (action.verb === "move") return action.pace === "quick" ? 400 : action.pace === "slow" ? 1_100 : 700;
  // A morph needs time for the eye to follow each piece to its new place.
  if (action.verb === "transform") return action.pace === "quick" ? 600 : action.pace === "slow" ? 1_400 : 900;
  if ((action.verb === "show" && !action.stagger) || action.verb === "set_style") return 0;
  if (action.pace === "quick") return 160;
  if (action.pace === "slow") return 600;
  if (action.verb === "highlight") return 220;
  // Clearing is gentler than drawing: the eye should notice what leaves without being pulled to it.
  return action.verb === "dim" || action.verb === "fade_out" || action.verb === "remove" ? 450 : 320;
}

/** What a frame needs beyond the timeline. `framing` collects one warning per camera action. */
interface FrameContext {
  measure?: MeasureObject;
  layoutFallback: boolean;
  /** Share of the screen the framed content may fill (camera_policy.focus_padding). */
  padding: number;
  framing?: Map<string, string>;
  moves?: ReadonlyMap<Action, { ids: string[]; shift: readonly [number, number] }>;
  cameras?: ReadonlyMap<Action, PlannedCamera>;
  onCameraPlan?: (plan: Omit<CameraPlanReport, "beat">) => void;
  /** This passage's framing, planned with the whole tranche (planTranche); absent: decided here, as before. */
  planned?: PlannedFraming;
}

function frameAt(before: NesalioFrame, timeline: readonly ScheduledAction[], playhead: number, ctx: FrameContext): NesalioFrame {
  const { measure } = ctx;
  let scene = before.scene;
  const reveals = new Map<string, Reveal>();
  const partReveals = new Map<string, Map<string, { key: string; progress: number }>>();
  const highlights = new Map<string, { role: Style; progress: number }>();
  const partHighlights = new Map<string, Map<string, { role: Style; progress: number }>>();
  const styles = new Map(before.styles);
  const opacity = new Map<string, number>();
  const morphs = new Map<string, { key: string; target: string; progress: number }>();
  const restingOpacity = (id: string) => before.scene.objects.get(id)?.dimmed ? DIM_OPACITY : 1;
  for (const { action: written, progress } of sampleBeat(timeline, playhead)) {
    // A formula replaced by a transform is designated by its old name: the gesture goes to the one standing there now.
    const action = redirect(written, scene);
    switch (action.verb) {
      case "show":
      case "draw":
      case "write": {
        if (action.verb === "write" && action.part !== undefined) {
          const written = before.scene.objects.get(action.target);
          scene = revealPart(scene, action.target, action.part);
          if (written && partVisible(written, action.part)) break;
          const parts = partReveals.get(action.target) ?? new Map();
          parts.set(action.part, { key: action.id, progress });
          partReveals.set(action.target, parts);
          break;
        }
        const ids = targetObjects(scene, action.target);
        // Showing what was dimmed brings it forward again.
        for (const id of ids) {
          const item = before.scene.objects.get(id);
          if (item?.visible && item.dimmed && progress < 1) opacity.set(id, DIM_OPACITY + (1 - DIM_OPACITY) * progress);
        }
        scene = setVisibility(scene, action.target, true);
        const lag = action.verb === "show" && action.stagger ? 0.6 : 0;
        ids.forEach((id, index) => {
          if (before.scene.objects.get(id)?.visible || reveals.has(id)) return;
          const delay = ids.length > 1 ? lag * index / (ids.length - 1) : 0;
          reveals.set(id, { key: action.id, verb: action.verb, progress: Math.max(0, (progress - delay) / (1 - delay)) });
        });
        break;
      }
      case "highlight":
        if (progress < 1 && action.part !== undefined) {
          const parts = partHighlights.get(action.target) ?? new Map();
          parts.set(action.part, { role: action.role ?? "accent", progress });
          partHighlights.set(action.target, parts);
        } else if (progress < 1) for (const id of targetObjects(scene, action.target)) {
          highlights.set(id, { role: action.role ?? "accent", progress });
        }
        break;
      case "set_style":
        for (const id of targetObjects(scene, action.target)) styles.set(id, action.role);
        break;
      case "dim":
        for (const id of clearedObjects(scene, action.target)) {
          const item = scene.objects.get(id);
          if (item?.visible && !before.scene.objects.get(id)?.dimmed && progress < 1) opacity.set(id, 1 - (1 - DIM_OPACITY) * progress);
        }
        scene = setDimmed(scene, action.target, true);
        break;
      case "transform":
        if (progress >= 1) {
          // The new formula stands where the old one was; the old one is replaced for good, its place is the new one's.
          scene = clearTarget(setVisibility(scene, action.target, true), action.source, true);
          scene = { ...scene, replacedBy: new Map(scene.replacedBy).set(action.source, action.target) };
        } else if (scene.objects.get(action.source)?.visible) {
          morphs.set(action.source, { key: action.id, target: action.target, progress });
          // The morph draws the source; the source itself stays on the board, unseen.
          opacity.set(action.source, 0);
        } else {
          // Nothing to morph from (the source is not on the board): the formula simply appears.
          scene = setVisibility(scene, action.target, true);
          reveals.set(action.target, { key: action.id, verb: "write", progress });
        }
        break;
      case "move": {
        const planned = ctx.moves?.get(written);
        if (!planned) break;
        const t = progress * progress * (3 - 2 * progress);
        scene = shiftObjects(scene, planned.ids, [planned.shift[0] * t, planned.shift[1] * t]);
        // Set aside on an edge or in a corner: to be kept in view. Moved elsewhere: an ordinary object again.
        const kept = new Set(scene.kept);
        if ("to_edge" in action.to || "to_corner" in action.to) kept.add(action.target); else kept.delete(action.target);
        scene = { ...scene, kept };
        break;
      }
      case "fade_out":
      case "remove":
        if (progress >= 1) {
          scene = clearTarget(scene, action.target, action.verb === "remove");
          break;
        }
        // Still on the board while it fades; it leaves (and frees its place) when the fade ends.
        for (const id of clearedObjects(scene, action.target)) {
          if (scene.objects.get(id)?.visible) opacity.set(id, restingOpacity(id) * (1 - progress));
        }
        break;
      case "animate_parameter": {
        const t = action.easing === "smooth" ? progress * progress * (3 - 2 * progress) : progress;
        scene = setParameter(scene, action.parameter, action.from + (action.to - action.from) * t, measure);
        break;
      }
      case "camera.focus":
      case "camera.restore": {
        const planned = ctx.cameras?.get(written);
        if (!planned) break;
        if (action.verb === "camera.focus" && action.save_as !== undefined && planned.saved) {
          scene = { ...scene, savedCamera: new Map(scene.savedCamera).set(action.save_as, planned.saved) };
        }
        if (planned.warning) ctx.framing?.set(action.id, planned.warning);
        const { move } = planned;
        if (!move) break;
        if (move.hidden.length) ctx.framing?.set(action.id, `Hors champ pour garder le texte lisible : ${move.hidden.join(", ")}.`);
        const state = progress < 1 ? move.path?.(progress) : undefined;
        scene = withCameraState(scene, {
          is_animating: state !== undefined, target_state: state ? move.state : null,
          state: state ?? move.state,
        });
        break;
      }
      default: throw new Error(`Action inexécutable « ${action.verb} ».`);
    }
  }
  return { scene, styles, reveals, partReveals, highlights, partHighlights, opacity, morphs };
}

/** If the targets do not fit: reveals first, then highlights, then the last target named. */
function focusPriority(scene: SceneState, targets: readonly string[], timeline: readonly ScheduledAction[]): string[] {
  const revealed = new Set<string>();
  const highlighted = new Set<string>();
  for (const { action: written } of timeline) {
    const action = redirect(written, scene);
    switch (action.verb) {
      case "show": case "draw": case "write": case "transform":
        for (const id of targetObjects(scene, action.target)) revealed.add(id);
        break;
      case "highlight":
        for (const id of targetObjects(scene, action.target)) highlighted.add(id);
        break;
    }
  }
  const members = targets.map((id) => ({ id, objects: targetObjects(scene, id) }));
  for (const active of [revealed, highlighted]) {
    const priority = members.filter(({ objects }) => objects.some((id) => active.has(id)));
    if (priority.length) return priority.map(({ id }) => id);
  }
  return targets.slice(-1);
}

function redirect(action: Action, scene: SceneState): Action {
  if (!scene.replacedBy.size) return action;
  const now = (id: string) => currentId(scene, id);
  if ("targets" in action) return { ...action, targets: action.targets.map(now) };
  if (action.verb === "transform") return { ...action, source: now(action.source) };
  if ("target" in action) return { ...action, target: now(action.target) };
  return action;
}

/** Use today's group members and omit objects that have left the board. */
function restoreGeometry(scene: SceneState, saved: SavedCameraFrame): { scene: SceneState; intent: FramingIntent } {
  const objects = new Map([...scene.objects].filter(([, item]) => !item.faded));
  const groups = new Map([...scene.groups].map(([id, group]) => [id, { ...group, items: group.items.map((item) => currentId(scene, item)) }]));
  const kept = new Set([...scene.kept].map((id) => currentId(scene, id)));
  const geometry = { ...scene, objects, groups, kept };
  const targets = [...new Set(saved.targets.map((id) => currentId(scene, id)))].filter((id) => sceneBounds(geometry, [id], "layout_bounds"));
  return { scene: geometry, intent: { targets, bounds: saved.bounds } };
}

/**
 * The closest the camera goes on its own (anticipation, following): the text's design size. A zoom beyond it is the
 * lesson's choice (camera.focus). Until 2026-11-10 the engine framed what appeared as tightly as CAMERA_ZOOM.max
 * (1.5): a single formula filled the screen, letters 90 px tall (judged « zoom excessif » on real lessons), and
 * every new object meant zooming out again. Measured on 248 lessons: discomfort 3.75 → 2.88 a minute, movements
 * faster than a screen a second 22 → 3, back-and-forths 22 → 13, cut objects 364 → 336 s.
 */
export const ENGINE_ZOOM_MAX = 1;

/**
 * camera_policy.focus_padding: how much room is left around what is framed.
 * "md" is the margin the engine always used (content fills 90 % of the screen).
 */
export const FOCUS_PADDING = { xs: 0.97, sm: 0.94, md: 0.9, lg: 0.85, xl: 0.8 } as const;

function planFocus(
  scene: SceneState, intent: FramingIntent, timing: CameraTiming, priority: readonly string[],
  { layoutFallback, padding }: Pick<FrameContext, "layoutFallback" | "padding">, fallback?: CameraState, maxZoom = Infinity,
  leaving: ReadonlySet<string> = new Set(),
) {
  // Nothing shown yet: frame the space reserved for what is about to appear.
  const bounds = intent.bounds
    ?? (layoutFallback && !sceneBounds(scene, intent.targets, "render_bounds") ? "layout_bounds" : "render_bounds");
  // What this passage erases is not kept in the frame: framing it would leave the rest small in a blank screen.
  const kept = keptInView(scene).filter((id) => !leaving.has(id));
  const outside = (id: string, state: CameraState) => {
    const box = sceneBounds(scene, [id], bounds) ?? sceneBounds(scene, [id], "layout_bounds");
    return box !== null && !inside(cameraView(scene, state), box);
  };
  const fit = (zoom: number) => fitSceneCamera(scene, intent.targets, bounds, { priority, kept, padding, avoidCutting: true, leaving, maxZoom: zoom });
  /** Objects on the board that a view would cut (partly in it). */
  const cutBy = (state: CameraState) => {
    const view = cameraView(scene, state);
    return [...scene.objects].filter(([id, item]) => {
      if (!item.visible || item.removed || item.faded || leaving.has(id)) return false;
      const box = sceneBounds(scene, [id], "render_bounds");
      return box !== null && box.x1 > view.x0 && box.x0 < view.x1 && box.y1 > view.y0 && box.y0 < view.y1 && !inside(view, box);
    }).length;
  };
  let fitted = fit(maxZoom);
  // The wider view of a capped zoom may reach a neighbour it cannot hold whole: the closer framing is kept then.
  if (fitted && Number.isFinite(maxZoom)) {
    const closer = fit(Infinity);
    if (closer && cutBy(closer.state) < cutBy(fitted.state)) fitted = closer;
  }
  fitted ??= fallback ? { state: fallback, hidden: kept.filter((id) => outside(id, fallback)) } : null;
  if (!fitted) return null;
  const target = fitted;
  if (timing.transition === "instant") return { target, move: target, duration: 0 };

  const current = scene.camera.state;
  const destination = scene.camera.target_state ?? current;
  const width = scene.initialViewport.x1 - scene.initialViewport.x0;
  const close = Math.hypot(target.state.x - destination.x, target.state.y - destination.y) <= 0.02 * width / destination.zoom
    && Math.abs(Math.log(target.state.zoom / destination.zoom)) <= Math.log(1.03);
  if (close && !target.hidden.length && ![...intent.targets, ...kept].some((id) => outside(id, destination))) {
    return { target, duration: 0 };
  }

  const interpolate = interpolateZoom([current.x, current.y, width / current.zoom], [target.state.x, target.state.y, width / target.state.zoom]);
  const path = (t: number): CameraState => {
    if (t === 0) return current;
    const [x, y, visibleWidth] = interpolate(t);
    // A whole graph may be framed further back than the readable zoom (GRAPH_ZOOM_MIN): the path may go there too.
    const zoom = Math.min(CAMERA_ZOOM.max, Math.max(Math.min(CAMERA_ZOOM.min, current.zoom, target.state.zoom), width / visibleWidth));
    return { x, y, zoom };
  };
  const pace = timing.pace === "quick" ? 0.5 : timing.pace === "slow" ? 1.875 : 1;
  // Slower than before (0.3 to 1.2 s): 493 movements of the bench went faster than a screen a second, which is what
  // makes a moving board tiring to watch. A short hop still takes 0.8 s, a long trip up to 2.2 s.
  const duration = Math.max(CAMERA_MOVE_MS.min, Math.min(CAMERA_MOVE_MS.max, Math.abs(interpolate.duration) * pace * 1.6));
  return { target, move: { ...target, path }, duration };
}

type MakeSchedule = (duration: (action: Action) => number) => BeatSchedule;

/**
 * One gentle movement at the start of a passage that frames, ahead of time, everything the passage is about to
 * show (with what stays on the board and the graphs it is drawn on), instead of one movement per object as each
 * one appears out of frame. Measured on 238 lessons (2026-11-09): 890 of 1 036 camera movements were the engine
 * following objects one by one, 493 of them faster than a screen a second. Skipped when the lesson moves the
 * camera itself in this passage (camera.focus, camera.restore), and when what is coming cannot all be framed
 * at a readable size (the following then frames each object as before).
 */
function anticipate(
  before: NesalioFrame, timeline: readonly ScheduledAction[], sliceObjects: readonly string[], clipEnd: number,
  ctx: FrameContext, quiet: FrameContext,
  add: (follow: Focus, entry: ScheduledAction, plan: { move: CameraMove; duration: number }) => void,
): void {
  if (clipEnd <= 0 || timeline.some(({ action }) => action.verb === "camera.focus" || action.verb === "camera.restore")) return;
  const scene = frameAt(before, [], 0, quiet).scene;
  if (ctx.planned) {
    planned(before, scene, timeline, clipEnd, ctx, add);
    return;
  }
  const coming = new Set<string>();
  const leaving = new Set<string>();
  for (const { action: written } of timeline) {
    const action = redirect(written, scene);
    if (action.verb === "show" || action.verb === "draw" || action.verb === "write" || action.verb === "transform") {
      for (const id of targetObjects(scene, action.target)) if (scene.objects.has(id) && !scene.objects.get(id)!.removed) coming.add(id);
    } else if (action.verb === "fade_out" || action.verb === "remove") {
      for (const id of targetObjects(scene, action.target)) leaving.add(id);
    }
  }
  const ids = [...coming].filter((id) => !scene.objects.get(id)!.visible);
  if (!ids.length) return;
  // The first object of the passage to appear: the camera arrives with it, not before (an empty spot framed early
  // left the student before a blank board — camera audit, 37 lessons in a first try).
  const firstReveal = Math.min(...timeline.filter(({ action }) => REVEAL_VERBS.has(action.verb)).map(({ start }) => start));
  const graphsOf = (list: readonly string[]) => {
    const frames = new Set(list.map((id) => scene.objects.get(id)?.frame).filter(Boolean));
    return [...scene.objects].filter(([, item]) => item.definition.type === "axes" && !item.removed && item.frame && frames.has(item.frame)).map(([id]) => id);
  };
  const staying = sliceObjects.filter((id) => scene.objects.get(id)?.visible && !scene.objects.get(id)?.faded && !leaving.has(id));
  // Still to come in the rest of the tranche: framed now too when everything fits, so the next passages need no movement.
  const later = sliceObjects.filter((id) => !scene.objects.get(id)?.visible && !scene.objects.get(id)?.removed && !ids.includes(id));
  const current = scene.camera.target_state ?? scene.camera.state;
  const view = cameraView(scene, current);
  const passage = [...new Set([...staying, ...graphsOf(ids), ...ids])];
  const box = sceneBounds(scene, passage, "layout_bounds");
  if (!box) return;
  // What the student will see once the passage has shown its objects: everything still on the board in view.
  const onBoard = [...scene.objects].filter(([id, item]) => item.visible && !item.faded && !item.removed && !leaving.has(id)).map(([id]) => id);
  const shownBox = (state: CameraState) => {
    const seen = cameraView(scene, state);
    const boxes = [...onBoard, ...ids].map((id) => sceneBounds(scene, [id], "layout_bounds")).filter((b): b is Box => b !== null && overlaps(b, seen));
    return boxes.length ? boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })) : null;
  };
  /** How far the picture is from a good composition (0 when it is good). */
  const flaw = (state: CameraState) => {
    const seen = shownBox(state);
    if (!seen) return 1;
    const { fill, offset } = composition(cameraView(scene, state), seen);
    // A small subject is fine at the text's design size; the screen is « too empty » only when the camera stepped back.
    return (state.zoom < 1 - 1e-6 ? Math.max(0, COMPOSITION.fill - fill) : 0) + Math.max(0, offset - COMPOSITION.offCenter);
  };
  /** How many objects on the board the frame would cut (partly in it). */
  const cutBy = (state: CameraState) => {
    const seen = cameraView(scene, state);
    return [...onBoard, ...ids].filter((id) => {
      const b = sceneBounds(scene, [id], "layout_bounds");
      return b !== null && overlaps(b, seen) && !inside(seen, b);
    }).length;
  };
  const inFrame = inside(view, box);
  // A picture already in frame is recomposed without enlarging its text beyond the design size (or the current one).
  const maxZoom = inFrame ? Math.max(ENGINE_ZOOM_MAX, current.zoom) : ENGINE_ZOOM_MAX;
  // Nothing to do when everything coming is in frame and the picture is already well composed.
  if (inFrame && flaw(current) === 0) return;
  const wholeTranche = [...new Set([...passage, ...later, ...graphsOf(later)])];
  // In order of preference: the rest of the tranche framed ahead (it saves the next movements), then the passage
  // alone; each first with what the passage erases still kept in frame (the framing before 2026-11-10), then without.
  const plans = [[wholeTranche, false], [passage, false], [wholeTranche, true], [passage, true]].flatMap(([targets, dropLeaving]) => {
    const follow: Focus = { id: `anticipe_${before.scene.currentBeat ?? "passage"}`, verb: "camera.focus", at: "beat:start", targets: targets as string[], bounds: "layout_bounds" };
    const plan = planFocus(scene, follow, follow, ids, ctx, undefined, maxZoom, dropLeaving ? leaving : undefined);
    return plan?.move && !plan.target.hidden.some((id) => follow.targets.includes(id))
      ? [{ follow, plan, flaw: flaw(plan.target.state), cut: cutBy(plan.target.state) }] : [];
  });
  // The first choice gives way only to a framing that cuts fewer objects, or cuts no more and is clearly better
  // composed (camera audit: off-centre 13.1 % → 7 % of the time). Never one that cuts more.
  const chosen = plans.reduce<(typeof plans)[number] | undefined>((best, candidate) =>
    !best || candidate.cut < best.cut || (candidate.cut === best.cut && candidate.flaw < best.flaw - 0.05) ? candidate : best, undefined);
  for (const candidate of chosen ? [chosen] : []) {
    const { follow, plan } = candidate;
    // Recomposing a picture already in frame: only for a clear gain, never a small shift (smallReframing),
    // and never by cutting something that was whole on screen.
    if (inFrame && (smallShift(scene, current, plan.target.state) || candidate.flaw > flaw(current) - 0.08 || candidate.cut > cutBy(current))) return;
    ctx.onCameraPlan?.({ action: follow.id, origin: "follow", durationMs: plan.duration, from: scene.camera.state, to: plan.target.state });
    const start = Number.isFinite(firstReveal) ? Math.max(0, firstReveal - plan.duration) : 0;
    add(follow, { action: follow, start, end: Math.min(clipEnd, start + plan.duration) }, { move: plan.move, duration: plan.duration });
    return;
  }
}

const REVEAL_VERBS = new Set(["show", "draw", "write", "transform"]);

/** The passage's part of the tranche's plan: hold the view, or one gentle movement that ends as the first object appears. */
function planned(
  before: NesalioFrame, scene: SceneState, timeline: readonly ScheduledAction[], clipEnd: number, ctx: FrameContext,
  add: (follow: Focus, entry: ScheduledAction, plan: { move: CameraMove; duration: number }) => void,
): void {
  if (ctx.planned === "hold" || !ctx.planned) return;
  const targets = ctx.planned.targets.filter((id) => scene.objects.has(id) && !scene.objects.get(id)!.removed);
  if (!targets.length) return;
  const leaving = new Set<string>();
  for (const { action } of timeline) {
    if ((action.verb === "fade_out" || action.verb === "remove") && "target" in action) for (const id of targetObjects(scene, action.target)) leaving.add(id);
  }
  const follow: Focus = { id: `plan_${before.scene.currentBeat ?? "passage"}`, verb: "camera.focus", at: "beat:start", targets, bounds: "layout_bounds" };
  const coming = timeline.filter(({ action }) => REVEAL_VERBS.has(action.verb) && "target" in action).flatMap(({ action }) => targetObjects(scene, (action as { target: string }).target));
  const plan = planFocus(scene, follow, follow, coming, ctx, undefined, ENGINE_ZOOM_MAX, leaving);
  if (!plan?.move) return;
  const firstReveal = Math.min(...timeline.filter(({ action }) => REVEAL_VERBS.has(action.verb)).map(({ start }) => start));
  ctx.onCameraPlan?.({ action: follow.id, origin: "follow", durationMs: plan.duration, from: scene.camera.state, to: plan.target.state });
  const start = Number.isFinite(firstReveal) ? Math.max(0, firstReveal - plan.duration) : 0;
  add(follow, { action: follow, start, end: Math.min(clipEnd, start + plan.duration) }, { move: plan.move, duration: plan.duration });
}

export { COMPOSITION, composition } from "./tranchePlan";

const overlaps = (a: Box, b: Box) => a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;

/** A move of under a tenth of a screen with a zoom within ×0.9 to ×1.1: not worth moving the picture. */
function smallShift(scene: SceneState, from: CameraState, to: CameraState): boolean {
  const width = (scene.initialViewport.x1 - scene.initialViewport.x0) / from.zoom;
  const ratio = to.zoom / from.zoom;
  return Math.hypot(to.x - from.x, to.y - from.y) / width < 0.1 && ratio > 0.9 && ratio < 1.1;
}

/**
 * A camera.focus written in the lesson whose targets are already wholly in view, for a small reframing (under a
 * quarter of a screen, zoom within ×0.8 to ×1.25): the board stays still. 58 of the 148 camera.focus of the bench
 * were such small shifts, moving the picture for nothing. A wanted zoom or a real trip is kept.
 */
function smallReframing(scene: SceneState, intent: FramingIntent, target: CameraState): boolean {
  const current = scene.camera.target_state ?? scene.camera.state;
  const view = cameraView(scene, current);
  const visible = intent.targets.every((id) => {
    const box = sceneBounds(scene, [id], "render_bounds") ?? sceneBounds(scene, [id], "layout_bounds");
    return box !== null && inside(view, box);
  });
  if (!visible) return false;
  // Visible but away in a corner: the lesson's framing is what brings it to the centre (seen on real lessons,
  // 2026-11-10: the final rule stayed bottom-left under the dimmed step, the camera.focus on it ignored).
  const targets = sceneBounds(scene, intent.targets, "layout_bounds");
  if (targets && composition(view, targets).offset > COMPOSITION.offCenter) return false;
  const width = (scene.initialViewport.x1 - scene.initialViewport.x0) / current.zoom;
  const distance = Math.hypot(target.x - current.x, target.y - current.y) / width;
  const ratio = target.zoom / current.zoom;
  return distance < 0.25 && ratio > 0.8 && ratio < 1.25;
}

/** Plan from the audio anchors in start order. A camera action with `at` is first given
 * zero duration, so learning its real duration can only delay its dependants. */
function planPassage(before: NesalioFrame, makeSchedule: MakeSchedule, sliceObjects: readonly string[], clipEnd: number, ctx: FrameContext) {
  const durations = new Map<Action, number>();
  const moves = new Map<Action, ReturnType<typeof moveShift>>();
  const cameras = new Map<Action, PlannedCamera>();
  const ordered = new Set<Action>();
  const automatic = new Map<Action, ScheduledAction>();
  const quiet: FrameContext = { ...ctx, framing: undefined, moves, cameras };
  const schedule = () => makeSchedule((action) => durations.get(action) ?? durationOf(action));
  let scheduled = schedule();
  let entries = new Map(scheduled.timeline.map((entry) => [entry.action, entry]));
  const prefix = () => Array.from(ordered, (action) => (entries.get(action) ?? automatic.get(action))!);
  const nextEntry = () => scheduled.timeline.find(({ action }) => !ordered.has(action));

  anticipate(before, scheduled.timeline, sliceObjects, clipEnd, ctx, quiet, (follow, entry, plan) => {
    cameras.set(follow, { move: plan.move });
    ordered.add(follow);
    automatic.set(follow, entry);
  });

  for (let entry = nextEntry(); entry; entry = nextEntry()) {
    const { action, start } = entry;
    ordered.add(action);
    if (action.verb === "move") {
      const scene = frameAt(before, prefix(), start, quiet).scene;
      const target = currentId(scene, action.target);
      if (scene.objects.has(target) || scene.groups.has(target)) moves.set(action, moveShift(scene, target, action.to));
    } else if (action.verb === "camera.focus" || action.verb === "camera.restore") {
      const current = frameAt(before, prefix(), start, quiet).scene;
      let scene = current;
      let intent: FramingIntent;
      let fallback: CameraState | undefined;
      if (action.verb === "camera.restore") {
        const saved = current.savedCamera.get(action.frame);
        if (!saved) {
          cameras.set(action, { warning: `Cadrage non sauvegardé « ${action.frame} ».` });
          continue;
        }
        ({ scene, intent } = restoreGeometry(current, saved));
        fallback = saved.state;
      } else {
        intent = { targets: action.targets.map((id) => currentId(current, id)), bounds: action.bounds };
      }
      let plan = planFocus(scene, intent, action, focusPriority(scene, intent.targets, scheduled.timeline), ctx, fallback);
      if (plan?.move && action.verb === "camera.focus" && action.save_as === undefined && action.transition !== "instant"
        && smallReframing(scene, intent, plan.target.state)) plan = null;
      const memory = action.verb === "camera.focus" && action.save_as !== undefined
        ? { targets: action.targets, bounds: action.bounds, state: plan?.target.state ?? current.camera.state }
        : undefined;
      cameras.set(action, { move: plan?.move, saved: memory });
      if (plan?.move) ctx.onCameraPlan?.({ action: action.id, origin: "lesson", durationMs: plan.duration, from: current.camera.state, to: plan.target.state });
      if (action.at && plan && plan.duration > 0) {
        durations.set(action, plan.duration);
        scheduled = schedule();
        entries = new Map(scheduled.timeline.map((item) => [item.action, item]));
      }
    } else if (action.verb === "show" || action.verb === "draw" || action.verb === "write" || action.verb === "transform"
      // A highlight the student cannot see is lost too (camera audit, 2026-11-09: 22 lessons out of 238).
      || action.verb === "highlight") {
      const scene = frameAt(before, prefix(), start, quiet).scene;
      const target = currentId(scene, action.target);
      const box = sceneBounds(scene, [target], "layout_bounds");
      // An active movement that already takes the reveal into view is enough.
      if (!box || inside(cameraView(scene, scene.camera.target_state ?? scene.camera.state), box)) continue;
      const shown = sliceObjects.filter((id) => scene.objects.get(id)?.visible);
      // Following an object drawn on a graph (a point, a rectangle, a label on a scatter plot): the whole graph comes
      // along, axes included. Camera audit (2026-11-09): following a point alone left its axes cut for up to 100 s.
      const highlight = action.verb === "highlight";
      const frame = scene.objects.get(target)?.frame;
      const graph = frame && !highlight
        ? [...scene.objects].filter(([, item]) => item.frame === frame && item.definition.type === "axes" && item.visible && !item.removed).map(([id]) => id)
        : [];
      const follow: Focus = {
        id: `suivi_${action.id}`, verb: "camera.focus", at: "beat:start",
        targets: [...new Set([...shown, ...graph, target])], bounds: "layout_bounds",
      };
      const plan = planFocus(scene, follow, follow, [target], ctx, undefined, ENGINE_ZOOM_MAX);
      if (!plan?.move) continue;
      // A highlight never takes away what the passage has just shown (a summary pointing back at a graph's points).
      if (highlight && plan.target.hidden.some((id) => shown.includes(id))) continue;
      cameras.set(follow, { move: plan.move });
      ctx.onCameraPlan?.({ action: action.id, origin: "follow", durationMs: plan.duration, from: scene.camera.state, to: plan.target.state });
      ordered.add(follow);
      automatic.set(follow, { action: follow, start, end: Math.min(clipEnd, start + plan.duration) });
    } else if (action.verb === "animate_parameter") {
      // dynamic_focus_policy: the whole area the animated objects will cover is framed before they move.
      const scene = frameAt(before, prefix(), start, quiet).scene;
      const dependents = [...scene.objects].filter(([, item]) => item.visible && !item.removed
        && parametersOf(item.definition, scene.math).includes(action.parameter)).map(([id]) => id);
      if (!dependents.length) continue;
      // Their axes come along, so the curve is seen in its frame.
      const frames = new Set(dependents.map((id) => scene.objects.get(id)!.frame).filter(Boolean));
      const axes = [...scene.objects].filter(([, item]) => item.visible && item.definition.type === "axes" && frames.has(item.frame)).map(([id]) => id);
      const targets = [...new Set([...axes, ...dependents])];
      const box = sceneBounds(scene, targets, "layout_bounds");
      if (!box || inside(cameraView(scene, scene.camera.target_state ?? scene.camera.state), box)) continue;
      const follow: Focus = { id: `plage_${action.id}`, verb: "camera.focus", at: "beat:start", targets, bounds: "layout_bounds" };
      const plan = planFocus(scene, follow, follow, dependents, ctx, undefined, ENGINE_ZOOM_MAX);
      if (!plan?.move) continue;
      cameras.set(follow, { move: plan.move });
      ctx.onCameraPlan?.({ action: action.id, origin: "range", durationMs: plan.duration, from: scene.camera.state, to: plan.target.state });
      ordered.add(follow);
      automatic.set(follow, { action: follow, start, end: Math.min(clipEnd, start + plan.duration) });
    }
  }
  return { timeline: prefix().map((entry) => lastingHighlight(entry, clipEnd)), deferred: scheduled.deferred, context: { ...ctx, moves, cameras } };
}

/** Shortest and longest camera movement (ms). */
export const CAMERA_MOVE_MS = { min: 800, max: 2_200 } as const;

/** Shortest time a highlight stays on, so the eye can find what it points at. */
export const MIN_HIGHLIGHT_MS = 1_500;

/**
 * A highlight lasted exactly its timing: 0.22 s for one given by `at` alone (38 % of highlights in the
 * bench lessons), the length of one or two words for an interval — the colour flashed and was gone
 * (seen by the user, 2026-11-09). It now stays at least MIN_HIGHLIGHT_MS, and a result stays highlighted
 * until the end of its passage. Never past the passage's end.
 */
export function lastingHighlight(entry: ScheduledAction, clipEnd: number): ScheduledAction {
  if (entry.action.verb !== "highlight" || clipEnd <= entry.start) return entry;
  const end = entry.action.role === "result" ? clipEnd : Math.min(clipEnd, Math.max(entry.end, entry.start + MIN_HIGHLIGHT_MS));
  return end === entry.end ? entry : { ...entry, end };
}

const CLEARINGS = new Set(["fade_out", "remove"]);
const REVEALS = new Set(["show", "write", "draw"]);

/** When an action starts, from the voice's word timings; undefined when it waits for another action. */
function anchorTime(action: Action, cues: ReadonlyMap<string, CueTiming>): number | undefined {
  const time = action.at ?? action.start;
  if (time === "beat:start") return 0;
  const match = typeof time === "string" ? /^cue(_end)?:(.+)$/.exec(time) : null;
  const timing = match ? cues.get(match[2]!) : undefined;
  return timing ? (match![1] ? timing.end : timing.start) : undefined;
}

/**
 * A clearing waits for the next thing written after it, so the board is never left empty while Nesa talks
 * (camera audit: the model often fades everything out a few words before the new line appears).
 */
export function clearWithFirstReveal(beat: Beat, cues: ReadonlyMap<string, CueTiming>): Beat {
  const referenced = new Set(beat.do.flatMap((action) => action.at?.startsWith("after:") ? [action.at.slice(6)] : []));
  const reveals = beat.do.flatMap((action) => {
    if (!REVEALS.has(action.verb)) return [];
    const start = anchorTime(action, cues);
    return start === undefined ? [] : [{ action, start }];
  });
  let changed = false;
  const actions = beat.do.map((action) => {
    if (!CLEARINGS.has(action.verb) || action.at === undefined || referenced.has(action.id)) return action;
    const start = anchorTime(action, cues);
    if (start === undefined) return action;
    const target = "target" in action ? action.target : undefined;
    const next = reveals
      .filter((reveal) => reveal.start >= start && ("target" in reveal.action ? reveal.action.target : undefined) !== target)
      .reduce<{ action: Action; start: number } | undefined>((a, b) => (!a || b.start < a.start ? b : a), undefined);
    if (!next || next.start === start) return action;
    changed = true;
    return { ...action, at: next.action.at ?? next.action.start } as Action;
  });
  return changed ? { ...beat, do: actions } : beat;
}

/**
 * A passage that only clears hands its clearings to the next passage of the tranche, where they wait for
 * its first new object: otherwise the board stays empty for a whole sentence (camera audit, recap passages).
 */
export function holdClearingsForNextBeat(slice: Slice): Slice {
  const referenced = new Set(slice.beats.flatMap((beat) => beat.do.flatMap((action) => action.at?.startsWith("after:") ? [action.at.slice(6)] : [])));
  const beats = slice.beats.map((beat) => ({ ...beat, do: [...beat.do] }));
  let changed = false;
  for (let index = 0; index < beats.length - 1; index += 1) {
    const beat = beats[index]!;
    const next = beats[index + 1]!;
    if (beat.do.some((action) => REVEALS.has(action.verb)) || !next.do.some((action) => REVEALS.has(action.verb))) continue;
    const touched = new Set(next.do.flatMap((action) => [
      ..."target" in action ? [action.target] : [], ..."source" in action ? [action.source] : [], ..."targets" in action ? action.targets : [],
    ]));
    const moved = beat.do.filter((action) => CLEARINGS.has(action.verb) && action.at !== undefined && !action.at.startsWith("after:")
      && !referenced.has(action.id) && !touched.has((action as { target: string }).target));
    if (!moved.length || next.do.length + moved.length > 64) continue;
    beat.do = beat.do.filter((action) => !moved.includes(action));
    next.do = [...moved.map((action) => ({ ...action, at: "beat:start" }) as Action), ...next.do];
    changed = true;
  }
  return changed ? { ...slice, beats } : slice;
}

function immediateSchedule(actions: readonly Action[], at: number): MakeSchedule {
  return () => ({ timeline: actions.map((action) => ({ action, start: at, end: at })), deferred: [] });
}

/** Something the student did not get as designed. Playback goes on; the cause should be fixed upstream. */
export interface NesalioWarning {
  beat: string;
  /** `deferred`: a gesture shown at the end of its passage. `silent`: a passage shown without voice.
   *  `framing`: targets left out of frame to keep text readable. */
  kind: "deferred" | "silent" | "framing";
  action?: string;
  reason: string;
}

export interface NesalioPlaybackOptions {
  viewport: Box;
  signal: AbortSignal;
  openClip(beat: Beat, signal: AbortSignal): Promise<NesalioClip>;
  prepareSlice?(slice: Slice, signal: AbortSignal, math: SceneState["math"], values: ReadonlyMap<string, number>): Promise<void>;
  /**
   * Called once a tranche has been played, before the next one starts (or the lesson ends), the board still showing
   * it: a question to the student is asked here and playback waits until it resolves (question.ts).
   */
  afterSlice?(sliceId: string, signal: AbortSignal): Promise<void>;
  measure?: MeasureObject;
  onFrame(frame: NesalioFrame, beat: Beat, playhead: number): void;
  onWarning?(warning: NesalioWarning): void;
  /** The next passage's tranche has not arrived yet: the model is still writing it. */
  onWaiting?(): void;
  /** Hold used for a passage without voice; replaceable in tests. */
  wait?(ms: number, signal: AbortSignal): Promise<void>;
  /** Pause and mute from the page: silences stop elapsing, the next passage waits for the resume. */
  control?: PlaybackControl;
  /** Each camera movement planned, with where it comes from (the lesson's own camera.focus or the engine's following). For audits. */
  onCameraPlan?(plan: CameraPlanReport): void;
}

/** A planned camera movement: `lesson` = a camera.focus or camera.restore written in the lesson; `follow` = the engine following a gesture; `range` = framing an animated parameter's range. */
export interface CameraPlanReport {
  beat: string;
  action: string;
  origin: "lesson" | "follow" | "range";
  durationMs: number;
  from: CameraState;
  to: CameraState;
}

/**
 * Silence after a passage (`pause_after`). Without one, a short breath still
 * separates two passages: the voice never runs straight into the next sentence.
 */
export const PAUSE_MS = { default: 350, brief: 600, normal: 1_000, long: 1_800 } as const;

/** Time to read a passage shown as a caption when its voice is unavailable. */
export function readingTimeMs(say: string): number {
  const words = say.split(/\s+/).filter(Boolean).length;
  return Math.min(15_000, Math.max(1_500, words * 400));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type QueuedBeat = { slice: Slice; beat: Beat; first: boolean };

function unsupportedIn(slice: Slice): Error | null {
  const unsupported = negotiateCapabilities(slice, playable);
  return unsupported.length
    ? new Error(`Capacités indisponibles dans « ${slice.slice_id} » : ${[...new Set(unsupported.map(({ name }) => name))].join(", ")}.`)
    : null;
}

/** Passages in reading order, filled as tranches arrive; `at` waits for one that is not there yet. */
function beatQueue(source: AsyncIterable<Slice>, signal: AbortSignal) {
  const items: QueuedBeat[] = [];
  let done = false;
  let failure: unknown;
  const waiters = new Set<() => void>();
  const notify = () => { for (const wake of waiters) wake(); waiters.clear(); };
  signal.addEventListener("abort", notify, { once: true });
  void (async () => {
    try {
      for await (const slice of source) {
        if (signal.aborted) break;
        const unsupported = unsupportedIn(slice);
        if (unsupported) throw unsupported;
        const held = holdClearingsForNextBeat(slice);
        held.beats.forEach((beat, index) => items.push({ slice: held, beat, first: index === 0 }));
        notify();
      }
    } catch (error) {
      failure = error;
    } finally {
      done = true;
      notify();
    }
  })();
  return {
    /** Whether the passage is already known, or known never to come. */
    settled: (index: number) => index < items.length || done,
    async at(index: number): Promise<QueuedBeat | undefined> {
      while (index >= items.length && !done) {
        signal.throwIfAborted();
        await new Promise<void>((resolve) => waiters.add(resolve));
      }
      signal.throwIfAborted();
      if (index < items.length) return items[index];
      if (failure) throw failure;
      return undefined;
    },
  };
}

/** Runs a complete v3.3 document. */
export async function playNesalioLesson(lesson: LessonDocument, options: NesalioPlaybackOptions): Promise<void> {
  // A complete document is refused before anything plays, as before streaming existed.
  const unsupported = lesson.slices.map(unsupportedIn).find(Boolean);
  if (unsupported) throw unsupported;
  await playNesalioStream(lesson, (async function* () { yield* lesson.slices; })(), options);
}

/**
 * Plays tranches as they arrive, while the model is still writing the next ones.
 * The audio element supplies every playhead sample; a late tranche is simply waited for.
 */
export async function playNesalioStream(header: LessonHeader, slices: AsyncIterable<Slice>, options: NesalioPlaybackOptions): Promise<void> {
  const scene = withMathContext(createScene(options.viewport, header.scene.layout_rules.placement.min_gap), header.scene.math_context);
  let frame: NesalioFrame = {
    scene, styles: new Map(), reveals: new Map(), partReveals: new Map(), highlights: new Map(), partHighlights: new Map(), opacity: new Map(),
    morphs: new Map(),
  };
  const work = new AbortController();
  const signal = AbortSignal.any([options.signal, work.signal]);
  const hold = (ms: number, on: AbortSignal) => pausableSleep(ms, on, options.control);
  const queue = beatQueue(slices, signal);
  const layoutFallback = header.scene.camera_policy.allow_focus_on_layout_bounds_for_unrevealed_targets;
  const padding = FOCUS_PADDING[header.scene.camera_policy.focus_padding];
  const prepare = (beat: Beat) => options.openClip(beat, signal).then(
    (clip) => ({ ok: true as const, clip }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  type Prepared = Awaited<ReturnType<typeof prepare>>;
  let next: Promise<Prepared | null> | undefined;
  try {
    let tranchePlan = new Map<string, PlannedFraming>();
    let previousSlice: string | undefined;
    for (let index = 0; ; index++) {
      signal.throwIfAborted();
      await whenRunning(options.control, signal);
      if (!queue.settled(index)) options.onWaiting?.();
      const current = await queue.at(index);
      // The tranche just played is over: its question, if it has one, is asked before anything else moves.
      if (previousSlice !== undefined && (!current || current.first)) {
        await options.afterSlice?.(previousSlice, signal);
        signal.throwIfAborted();
        await whenRunning(options.control, signal);
      }
      if (!current) break;
      const { slice, beat, first } = current;
      previousSlice = slice.slice_id;
      const sliceObjects = slice.introduces.map(({ id }) => id);
      // Prepares the following passage's voice as soon as its tranche has arrived.
      const following = () => queue.at(index + 1).then((item) => item ? prepare(item.beat) : null, () => null);
      if (first) {
        await options.prepareSlice?.(slice, signal, frame.scene.math, symbolValues(frame.scene));
        signal.throwIfAborted();
        frame = { ...frame, scene: introduceSlice(frame.scene, slice, options.measure) };
        // The tranche's camera, planned at once now that its whole content is placed.
        // Measured on 249 lessons against the passage-by-passage choice: cut objects 336 → 309 s, off-centre
        // 8.5 → 7.3 % of the time, discomfort 2.91 → 2.99 a minute (2026-11-10).
        tranchePlan = planTranche(frame.scene, slice, padding, ENGINE_ZOOM_MAX);
      }
      const before = { ...frame, scene: beginBeat(frame.scene, slice.slice_id, beat.id) };
      const framing = new Map<string, string>();
      const ctx: FrameContext = { measure: options.measure, layoutFallback, padding, framing, planned: tranchePlan.get(beat.id),
        onCameraPlan: options.onCameraPlan && ((plan) => options.onCameraPlan!({ ...plan, beat: beat.id })) };
      // Reported once per camera action, at the end of the passage, not on every frame.
      const reportFraming = () => {
        for (const [action, reason] of framing) {
          options.onWarning?.({ beat: beat.id, kind: "framing", action, reason });
        }
      };
      let prepared = (next ? await next : null) ?? await prepare(beat);
      next = undefined;
      // One more attempt before giving up on the voice of this passage.
      if (!prepared.ok && !signal.aborted) prepared = await prepare(beat);
      signal.throwIfAborted();
      if (!prepared.ok) {
        // Without voice nothing can claim to be synchronised: the passage is shown whole, as a caption.
        options.onWarning?.({ beat: beat.id, kind: "silent", reason: errorMessage(prepared.error) });
        next = following();
        const planned = planPassage(before, immediateSchedule(beat.do, 0), sliceObjects, 0, ctx);
        frame = frameAt(before, planned.timeline, 0, planned.context);
        options.onFrame(frame, beat, 0);
        reportFraming();
        await (options.wait ?? hold)(readingTimeMs(beat.say), signal);
        continue;
      }
      const { clip } = prepared;
      try {
        signal.throwIfAborted();
        const timed = clearWithFirstReveal(beat, clip.cues);
        const schedule: MakeSchedule = (duration) => scheduleBeat(timed, clip.cues, clip.durationMs, duration);
        const { timeline, deferred, context } = planPassage(before, schedule, sliceObjects, clip.durationMs, ctx);
        for (const { action, reason } of deferred) options.onWarning?.({ beat: beat.id, kind: "deferred", action: action.id, reason });
        next = following();
        let interrupted = false;
        try {
          await clip.play((playhead) => {
            frame = frameAt(before, timeline, playhead, context);
            options.onFrame(frame, beat, playhead);
          }, signal, options.control);
        } catch (error) {
          if (signal.aborted) throw error;
          interrupted = true;
          options.onWarning?.({ beat: beat.id, kind: "deferred", reason: `Lecture interrompue : ${errorMessage(error)}` });
        }
        if (deferred.length || interrupted) {
          // Deferred gestures land after their explanation, never before it; the board is complete for what follows.
          const end = clip.durationMs;
          frame = frameAt(before, timeline, end, context);
          if (deferred.length) {
            const final = planPassage(frame, immediateSchedule(deferred.map(({ action }) => action), end), sliceObjects, end, ctx);
            frame = frameAt(frame, final.timeline, end, final.context);
          }
          options.onFrame(frame, beat, end);
        }
        reportFraming();
      } finally {
        clip.dispose();
      }
      // A breath after the passage, so the student can look at the board before the next sentence.
      await (options.wait ?? hold)(PAUSE_MS[beat.pause_after ?? "default"], signal);
    }
  } finally {
    work.abort();
    if (next) void next.then((prepared) => { if (prepared?.ok) prepared.clip.dispose(); });
  }
}
