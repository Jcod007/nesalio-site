/**
 * Rendu du tableau avec manim-web.
 *
 * Le rendu est une projection de l'état du tableau (`BoardState`) : à chaque
 * changement, il compare l'état reçu à ce qu'il a déjà dessiné et lance les
 * animations de Manim qui manquent (Create, GrowArrow, Write, Indicate,
 * FadeOut). Les heures d'apparition prévues par le lecteur deviennent des
 * horodatages `playWithTimestamps`, ce qui garde le tracé synchronisé avec
 * la voix.
 *
 * La caméra (tableau infini : molette, glisser, pincer) est gérée ici, avec
 * les calculs purs de camera.ts.
 */
import {
  Arrow,
  Axes,
  Circle,
  Create,
  DashedLine,
  DashedVMobject,
  Dot,
  FadeIn,
  FadeOut,
  GrowArrow,
  GrowFromCenter,
  Indicate,
  Line,
  Scene,
  Text,
  registerTheme,
  setTheme,
  type Animation,
  type Mobject,
  type VMobject,
} from "manim-web";
import { formatNumber, niceStep, sampleCurve } from "@/domain/board/geometry";
import { DEFAULT_FRAME, type BoardItem, type BoardState, type Frame } from "@/domain/board/state";
import { compileExpression } from "@/domain/math/expr";
import { BRAND, STROKE } from "@/ui/theme";
import { fitView, gridFor, lerpView, panBy, zoomAt, type View, type Viewport, type WorldBox } from "./camera";

type Vec3 = [number, number, number];

interface TimedAnimation {
  animation: Animation;
  /** Secondes depuis le moment où le lot est lancé. */
  start: number;
  end: number;
}

interface Rendered {
  revealStart: number;
  mobjects: Mobject[];
  erased: boolean;
}

/** Taille du repère dans le monde de Manim (cadre standard : 14 × 8). */
const AXES_BOX = { width: 11.5, height: 6.4 };
const HAND_FONT = "Caveat";
const LABEL_SIZE = 34;

let themeReady = false;
function ensureTheme() {
  if (themeReady) return;
  registerTheme("nesalio", { strokeColor: BRAND.ink, fillColor: BRAND.ink, background: BRAND.paper });
  setTheme("nesalio");
  themeReady = true;
}

export interface RendererCallbacks {
  /** La caméra a bougé (pour le quadrillage CSS et le bouton « recentrer »). */
  onViewChange?(view: View, userMoved: boolean): void;
}

export class ManimRenderer {
  private readonly scene: Scene;
  private readonly container: HTMLElement;
  private viewport: Viewport;
  private view: View = { cx: 0, cy: 0, s: 60 };
  private userMoved = false;
  private cameraTween = 0;
  private cameraTimer: ReturnType<typeof setTimeout> | null = null;

  private axes: Axes | null = null;
  private axesMobjects: Mobject[] = [];
  private axesRevealStart: number | null = null;
  private frame: Frame = DEFAULT_FRAME;
  private items = new Map<string, Rendered>();
  private highlightsSeen = new Map<string, number>();
  private cameraAt: number | null = null;

  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly detach: Array<() => void> = [];

  constructor(container: HTMLElement, private readonly callbacks: RendererCallbacks = {}) {
    ensureTheme();
    this.container = container;
    this.scene = new Scene(container, { backgroundColor: BRAND.paper, backgroundOpacity: 0 });
    this.viewport = { width: container.clientWidth, height: container.clientHeight, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
    this.axes = this.coordinatesFor(DEFAULT_FRAME);
    this.attachInteractions();
    const observer = new ResizeObserver(() => this.handleResize());
    observer.observe(container);
    this.detach.push(() => observer.disconnect());
    this.applyView(fitView(this.homeBox(), this.viewport), false);
  }

  /* --------------------------------- état --------------------------------- */

  /** Compare l'état reçu à ce qui est dessiné et lance ce qui manque. */
  sync(board: BoardState, now: number): void {
    if (board.order.length === 0 && board.axes === null && (this.items.size > 0 || this.axesMobjects.length > 0)) {
      this.clear();
    }

    const batch: TimedAnimation[] = [];
    const at = (start: number, durationMs: number): Pick<TimedAnimation, "start" | "end"> => {
      const s = Math.max(0, (start - now) / 1000);
      return { start: s, end: s + Math.max(0.05, durationMs / 1000) };
    };

    // Repère
    if (board.axes && board.axes.reveal.start !== this.axesRevealStart) {
      for (const old of this.axesMobjects) batch.push({ animation: new FadeOut(old, { duration: 0.3 }), ...at(board.axes.reveal.start, 300) });
      const { start, duration } = board.axes.reveal;
      this.frame = board.axes.frame;
      this.axes = this.coordinatesFor(board.axes.frame);
      const labels = this.axesLabels(board.axes.frame);
      this.axesMobjects = [this.axes, ...labels];
      this.axesRevealStart = start;
      batch.push({ animation: new Create(this.axes, { duration: duration / 1000 }), ...at(start, duration) });
      for (const label of labels) {
        batch.push({ animation: new FadeIn(label, { duration: (duration * 0.5) / 1000 }), ...at(start + duration * 0.5, duration * 0.5) });
      }
      if (!this.userMoved) this.animateView(fitView(this.homeBox(), this.viewport), 700, board.axes.reveal.start - now);
    }

    // Objets
    for (const id of board.order) {
      const item = board.items[id];
      if (!item) continue;
      const rendered = this.items.get(id);
      if (!rendered || rendered.revealStart !== item.reveal.start) {
        if (rendered) this.scene.remove(...rendered.mobjects);
        const built = this.build(item);
        this.items.set(id, { revealStart: item.reveal.start, mobjects: built.mobjects, erased: false });
        for (const anim of built.animations) {
          const start = item.reveal.start + anim.delay * item.reveal.duration;
          const duration = anim.share * item.reveal.duration;
          batch.push({ animation: anim.make(duration / 1000), ...at(start, duration) });
        }
      }
      const current = this.items.get(id)!;
      if (item.erased && !current.erased) {
        current.erased = true;
        for (const mobject of current.mobjects) {
          batch.push({ animation: new FadeOut(mobject, { duration: item.erased.duration / 1000 }), ...at(item.erased.start, item.erased.duration) });
        }
      }
    }

    // Mises en évidence
    for (const [id, start] of Object.entries(board.highlights)) {
      if (this.highlightsSeen.get(id) === start) continue;
      this.highlightsSeen.set(id, start);
      const target = this.items.get(id)?.mobjects[0];
      if (!target) continue;
      const isCurve = board.items[id]?.type === "curve";
      batch.push({
        animation: new Indicate(target, { duration: 1.2, scaleFactor: isCurve ? 1 : 1.25, color: BRAND.violet }),
        ...at(start, 1200),
      });
    }

    // Caméra
    if (board.camera && board.camera.at !== this.cameraAt) {
      this.cameraAt = board.camera.at;
      const target =
        board.camera.kind === "reset"
          ? fitView(this.homeBox(), this.viewport)
          : fitView(this.mathBox(board.camera.x, board.camera.y), this.viewport, 0.85);
      this.userMoved = false;
      this.animateView(target, board.camera.duration, board.camera.at - now);
    }

    if (batch.length > 0) this.enqueue(batch);
  }

  /** Marges de l'interface : la caméra cadre le contenu dans la zone libre. */
  setInsets(insets: Viewport["insets"]): void {
    const changed = JSON.stringify(insets) !== JSON.stringify(this.viewport.insets);
    this.viewport = { ...this.viewport, insets };
    if (changed && !this.userMoved) this.animateView(fitView(this.homeBox(), this.viewport), 400, 0);
  }

  /** Retour à la vue d'ensemble (bouton « Recentrer »). */
  recenter(): void {
    this.userMoved = false;
    this.animateView(fitView(this.homeBox(), this.viewport), 600, 0);
  }

  dispose(): void {
    this.generation++;
    if (this.cameraTimer) clearTimeout(this.cameraTimer);
    cancelAnimationFrame(this.cameraTween);
    for (const off of this.detach) off();
    this.scene.dispose();
  }

  /* ------------------------------- construction ------------------------------- */

  private clear() {
    this.generation++;
    this.queue = Promise.resolve();
    this.scene.stop();
    this.scene.clear();
    this.items.clear();
    this.highlightsSeen.clear();
    this.axesMobjects = [];
    this.axesRevealStart = null;
    this.cameraAt = null;
    this.frame = DEFAULT_FRAME;
    this.axes = this.coordinatesFor(DEFAULT_FRAME);
    this.userMoved = false;
    this.animateView(fitView(this.homeBox(), this.viewport), 400, 0);
  }

  /** Repère (même échelle en x et en y) qui sert aussi à convertir les coordonnées. */
  private coordinatesFor(frame: Frame): Axes {
    const dx = frame.x[1] - frame.x[0];
    const dy = frame.y[1] - frame.y[0];
    const unit = Math.min(AXES_BOX.width / dx, AXES_BOX.height / dy);
    return new Axes({
      xRange: [frame.x[0], frame.x[1], niceStep(dx)],
      yRange: [frame.y[0], frame.y[1], niceStep(dy, 7)],
      xLength: dx * unit,
      yLength: dy * unit,
      color: BRAND.ink,
      axisConfig: { color: BRAND.ink, strokeWidth: 2.5, tickSize: 0.12 },
      tips: true,
      tipLength: 0.18,
    });
  }

  /** Graduations chiffrées et noms des axes (le repère courant doit être `this.axes`). */
  private axesLabels(frame: Frame): Mobject[] {
    const labels: Mobject[] = [];
    const xStep = niceStep(frame.x[1] - frame.x[0]);
    const yStep = niceStep(frame.y[1] - frame.y[0], 7);
    const oy = clampTo(0, frame.y);
    const ox = clampTo(0, frame.x);
    for (let v = Math.ceil(frame.x[0] / xStep) * xStep; v <= frame.x[1] - xStep * 0.5; v += xStep) {
      if (Math.abs(v) < 1e-9) continue;
      labels.push(this.label(formatNumber(v), add(this.p(v, oy), [0, -0.28, 0]), BRAND.muted, 20, "body"));
    }
    for (let v = Math.ceil(frame.y[0] / yStep) * yStep; v <= frame.y[1] - yStep * 0.5; v += yStep) {
      if (Math.abs(v) < 1e-9) continue;
      labels.push(this.label(formatNumber(v), add(this.p(ox, v), [-0.3, 0, 0]), BRAND.muted, 20, "body"));
    }
    if (frame.xLabel) labels.push(this.label(frame.xLabel, add(this.p(frame.x[1], oy), [-0.15, 0.35, 0]), BRAND.ink, LABEL_SIZE));
    if (frame.yLabel) labels.push(this.label(frame.yLabel, add(this.p(ox, frame.y[1]), [0.4, -0.1, 0]), BRAND.ink, LABEL_SIZE));
    return labels;
  }

  private p(x: number, y: number): Vec3 {
    return this.axes!.c2p(x, y) as Vec3;
  }

  private label(text: string, at: Vec3, color: string, size = LABEL_SIZE, font: "hand" | "body" = "hand"): Mobject {
    const mobject = new Text({
      text,
      fontSize: size,
      fontFamily: font === "hand" ? HAND_FONT : "Atkinson Hyperlegible, sans-serif",
      fontWeight: font === "hand" ? 600 : 400,
      color,
    });
    mobject.moveTo(at);
    return mobject;
  }

  /**
   * Construit les mobjects d'un objet et décrit leurs animations :
   * `delay` et `share` sont des fractions de la durée d'apparition prévue.
   */
  private build(item: BoardItem): { mobjects: Mobject[]; animations: Array<{ delay: number; share: number; make: (s: number) => Animation }> } {
    const color = STROKE[item.color ?? (item.type === "curve" ? "blue" : item.type === "vector" ? "violet" : "ink")];
    switch (item.type) {
      case "curve": {
        const f = compileExpression(item.fn);
        const pieces = sampleCurve(item.fn, this.frame, item.from, item.to);
        const graphs = pieces.map((piece) => {
          const graph = this.axes!.plot(f, { xRange: [piece[0]![0], piece.at(-1)![0]], color, strokeWidth: item.style === "dotted" ? 7 : 4.5, numSamples: 160 });
          if (item.style === "dashed" || item.style === "dotted") {
            const length = Math.abs(piece.at(-1)![0] - piece[0]![0]);
            return new DashedVMobject({ vmobject: graph as unknown as VMobject, numDashes: Math.max(8, Math.round(length * 6)), dashRatio: item.style === "dotted" ? 0.08 : 0.55 });
          }
          return graph;
        });
        const mobjects: Mobject[] = [...graphs];
        const animations = graphs.map((graph, i) => ({
          delay: i / Math.max(1, graphs.length),
          share: 1 / Math.max(1, graphs.length),
          make: (s: number) => new Create(graph, { duration: s }) as Animation,
        }));
        const last = pieces.at(-1)?.at(-1);
        if (item.label && last) {
          const text = this.label(item.label, add(this.p(last[0], last[1]), [0.3, 0.3, 0]), color);
          mobjects.push(text);
          animations.push({ delay: 0.85, share: 0.15, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "point": {
        const center = this.p(item.at[0], item.at[1]);
        const dot = new Dot({ point: center, radius: 0.085, color });
        const mobjects: Mobject[] = [dot];
        const animations: Array<{ delay: number; share: number; make: (s: number) => Animation }> = [
          { delay: 0, share: 0.6, make: (s) => new GrowFromCenter(dot, { duration: s }) },
        ];
        if (item.ring) {
          const ring = new Circle({ radius: 0.2, color, strokeWidth: 3, center });
          mobjects.push(ring);
          animations.push({ delay: 0.2, share: 0.8, make: (s) => new Create(ring, { duration: s }) });
        }
        if (item.label) {
          const text = this.label(item.label, add(center, [0.25, 0.42, 0]), BRAND.ink);
          text.shift([textHalfWidth(text), 0, 0]);
          mobjects.push(text);
          animations.push({ delay: 0.4, share: 0.6, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "vector":
      case "segment": {
        const from = this.p(item.from[0], item.from[1]);
        const to = this.p(item.to[0], item.to[1]);
        const mobjects: Mobject[] = [];
        const animations: Array<{ delay: number; share: number; make: (s: number) => Animation }> = [];
        if (item.type === "vector") {
          const arrow = new Arrow({ start: from, end: to, color, strokeWidth: 5, tipLength: 0.22, tipWidth: 0.2 });
          mobjects.push(arrow);
          animations.push({ delay: 0, share: 1, make: (s) => new GrowArrow(arrow, { duration: s }) });
        } else {
          const line = item.dashed
            ? new DashedLine({ start: from, end: to, color, strokeWidth: 3, dashLength: 0.12 })
            : new Line({ start: from, end: to, color, strokeWidth: 3.5 });
          mobjects.push(line);
          animations.push({ delay: 0, share: 1, make: (s) => new Create(line, { duration: s }) });
        }
        if (item.label) {
          const anchor = item.type === "vector" ? to : mid(from, to);
          const normal = perpendicular(from, to, this.p(0, 0));
          const text = this.label(item.label, add(anchor, scale(normal, 0.38)), color);
          mobjects.push(text);
          animations.push({ delay: 0.6, share: 0.4, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "text": {
        const text = this.label(item.text, this.p(item.at[0], item.at[1]), color, 40);
        return {
          mobjects: [text],
          animations: [{ delay: 0, share: 1, make: (s) => new FadeIn(text, { duration: s, shift: [0, -0.12, 0] }) }],
        };
      }
    }
  }

  /* --------------------------------- lecture --------------------------------- */

  /** Les lots s'enchaînent : un lot ne démarre qu'après le précédent. */
  private enqueue(batch: TimedAnimation[]) {
    const generation = this.generation;
    const queuedAt = performance.now();
    this.queue = this.queue
      .then(async () => {
        if (generation !== this.generation) return;
        const late = (performance.now() - queuedAt) / 1000;
        const entries = batch.map(({ animation, start, end }) => {
          const shifted = Math.max(0, start - late);
          return { animation, start: shifted, end: shifted + (end - start) };
        });
        await this.scene.playWithTimestamps(entries);
      })
      .catch((error) => console.warn("manim: animation impossible", error));
  }

  /* --------------------------------- caméra --------------------------------- */

  private homeBox(): WorldBox {
    if (!this.axes) return { x: 0, y: 0, width: 14, height: 8 };
    return this.mathBox(this.frame.x, this.frame.y, 0.6);
  }

  private mathBox(x: [number, number], y: [number, number], margin = 0.3): WorldBox {
    const [x0, y0] = this.p(x[0], y[0]);
    const [x1, y1] = this.p(x[1], y[1]);
    return {
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      width: Math.abs(x1 - x0) + margin * 2,
      height: Math.abs(y1 - y0) + margin * 2,
    };
  }

  private applyView(view: View, userMoved: boolean) {
    this.view = view;
    const { width, height } = this.viewport;
    if (width === 0 || height === 0) return;
    const camera = this.scene.camera;
    camera.frameWidth = width / view.s;
    camera.frameHeight = height / view.s;
    camera.moveTo([view.cx, view.cy, 10]);
    this.scene.render();
    const grid = gridFor(view, this.viewport);
    this.container.style.backgroundSize = `${grid.size}px ${grid.size}px`;
    this.container.style.backgroundPosition = `${grid.x}px ${grid.y}px`;
    this.callbacks.onViewChange?.(view, userMoved);
  }

  private animateView(target: View, durationMs: number, delayMs: number) {
    if (this.cameraTimer) clearTimeout(this.cameraTimer);
    cancelAnimationFrame(this.cameraTween);
    const start = () => {
      const from = this.view;
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / Math.max(1, durationMs));
        this.applyView(lerpView(from, target, t), false);
        if (t < 1) this.cameraTween = requestAnimationFrame(step);
      };
      this.cameraTween = requestAnimationFrame(step);
    };
    if (delayMs > 16) this.cameraTimer = setTimeout(start, delayMs);
    else start();
  }

  private handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { ...this.viewport, width, height };
    this.applyView(this.userMoved ? this.view : fitView(this.homeBox(), this.viewport), this.userMoved);
  }

  /** Molette (zoom), glisser (déplacement) et pincer (zoom tactile). */
  private attachInteractions() {
    const el = this.container;
    const userView = (view: View) => {
      this.userMoved = true;
      if (this.cameraTimer) clearTimeout(this.cameraTimer);
      cancelAnimationFrame(this.cameraTween);
      this.applyView(view, true);
    };
    const local = (event: { clientX: number; clientY: number }) => {
      const rect = el.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top] as const;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const [x, y] = local(event);
      if (event.ctrlKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        userView(zoomAt(this.view, this.viewport, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), x, y));
      } else {
        userView(panBy(this.view, -event.deltaX, -event.deltaY));
      }
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    const onDown = (event: PointerEvent) => {
      el.setPointerCapture(event.pointerId);
      const [x, y] = local(event);
      pointers.set(event.pointerId, { x, y });
      if (pointers.size === 2) pinchDistance = distance([...pointers.values()]);
    };
    const onMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const [x, y] = local(event);
      pointers.set(event.pointerId, { x, y });
      if (pointers.size === 1) {
        userView(panBy(this.view, x - previous.x, y - previous.y));
      } else if (pointers.size === 2) {
        const points = [...pointers.values()];
        const d = distance(points);
        const cx = (points[0]!.x + points[1]!.x) / 2;
        const cy = (points[0]!.y + points[1]!.y) / 2;
        if (pinchDistance > 0) userView(zoomAt(this.view, this.viewport, d / pinchDistance, cx, cy));
        pinchDistance = d;
      }
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      pinchDistance = pointers.size === 2 ? distance([...pointers.values()]) : 0;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    this.detach.push(() => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    });
  }
}

/* ------------------------------- petits outils ------------------------------- */

function clampTo(v: number, [a, b]: [number, number]) {
  return v < a ? a : v > b ? b : v;
}
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0];
/**
 * Normale unitaire du trait, du côté opposé à l'origine du repère : l'étiquette
 * ne tombe pas sur les axes. À défaut (trait qui part de l'origine), vers le haut.
 */
function perpendicular(a: Vec3, b: Vec3, origin: Vec3): Vec3 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  let n: Vec3 = [-dy / length, dx / length, 0];
  const m = mid(a, b);
  const away = n[0] * (m[0] - origin[0]) + n[1] * (m[1] - origin[1]);
  if (Math.abs(away) > 1e-6) {
    if (away < 0) n = [-n[0], -n[1], 0];
  } else if (n[1] < 0 || (n[1] === 0 && n[0] < 0)) {
    n = [-n[0], -n[1], 0];
  }
  return n;
}
function textHalfWidth(mobject: Mobject): number {
  try {
    return mobject.getWidth() / 2;
  } catch {
    return 0;
  }
}
function distance(points: Array<{ x: number; y: number }>) {
  const [a, b] = points;
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
