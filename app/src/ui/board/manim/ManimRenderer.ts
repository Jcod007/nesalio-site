/**
 * Rendu du tableau avec manim-web.
 *
 * Le rendu est une projection du graphe de scène (`BoardState`) : à chaque
 * changement, il compare le graphe reçu à ce qu'il a déjà dessiné et lance
 * les animations de Manim qui manquent — tracer (Create, GrowArrow), écrire,
 * déplacer (glissement relatif), transformer (TransformMatchingShapes, ReplacementTransform),
 * estomper, faire pulser (Indicate), effacer (FadeOut). Les heures prévues par
 * le lecteur deviennent des horodatages `playWithTimestamps`, ce qui garde le
 * tracé synchronisé avec la voix.
 *
 * Il ne connaît pas les commandes du langage de scène, seulement les nœuds :
 * ajouter une commande ne demande pas de toucher au rendu.
 *
 * La caméra (tableau infini : molette, glisser, pincer) est gérée ici, avec
 * les calculs purs de camera.ts ; elle recadre le contenu quand il grandit.
 */
import {
  Arc,
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
  Polygon,
  ReplacementTransform,
  Scene,
  Text,
  UpdateFromAlphaFunc,
  registerTheme,
  setTheme,
  type Animation,
  type Mobject,
  type VMobject,
} from "manim-web";
import { formatNumber, niceStep, sampleCurve } from "@/domain/board/geometry";
import { AXES_BOX, contentBox, fontSizeOf, FONT_SIZE } from "@/domain/board/layout";
import { DEFAULT_FRAME, lastMotion, type BoardNode, type BoardState, type Frame, type Vec2 } from "@/domain/board/state";
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

interface PlannedAnimation {
  delay: number;
  share: number;
  make: (seconds: number) => Animation;
}

/** Ce qui est dessiné pour un nœud du graphe, et ce qui en a déjà été animé. */
interface Rendered {
  revealStart: number;
  mobjects: Mobject[];
  erased: boolean;
  /** Déplacement cumulé déjà appliqué aux mobjects (coordonnées mathématiques). */
  appliedOffset: Vec2;
  /** Début du dernier déplacement déjà animé (les suivants restent à jouer). */
  motionStart?: number;
  morphStart?: number;
  dimStart?: number;
  opacity: number;
}

const HAND_FONT = "Caveat";
/** En dessous de cette durée d'apparition, un nœud est posé d'un coup (copie). */
const INSTANT_MS = 1;
/** Opacité d'un objet estompé (contexte), comme dans les vidéos de 3Blue1Brown. */
const DIMMED = 0.28;

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

  private board: BoardState | null = null;
  private axes: Axes | null = null;
  private axesMobjects: Mobject[] = [];
  private axesRevealStart: number | null = null;
  private axesClearedAt: number | null = null;
  private frame: Frame = DEFAULT_FRAME;
  private items = new Map<string, Rendered>();
  private highlightsSeen = new Map<string, number>();
  private cameraAt: number | null = null;
  /** Zoom demandé par le modèle (focus) : la caméra ne recadre pas d'elle-même pendant ce temps. */
  private focused = false;
  private lastContentKey = "";

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

  /** Compare le graphe reçu à ce qui est dessiné et lance ce qui manque. */
  sync(board: BoardState, now: number): void {
    if (board.order.length === 0 && board.axes === null && (this.items.size > 0 || this.axesMobjects.length > 0)) {
      this.clear();
    }
    this.board = board;

    const batch: TimedAnimation[] = [];
    const at = (start: number, durationMs: number): Pick<TimedAnimation, "start" | "end"> => {
      const s = Math.max(0, (start - now) / 1000);
      return { start: s, end: s + Math.max(0.05, durationMs / 1000) };
    };

    // Repère effacé (commande clear avec le repère).
    if (board.axesCleared && board.axesCleared.start !== this.axesClearedAt) {
      this.axesClearedAt = board.axesCleared.start;
      for (const old of this.axesMobjects) batch.push({ animation: new FadeOut(old, { duration: 0.4 }), ...at(board.axesCleared.start, 400) });
      this.axesMobjects = [];
      this.axesRevealStart = null;
    }

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
    }

    // Nœuds du graphe
    for (const id of board.order) {
      const node = board.nodes[id];
      if (!node) continue;
      this.syncNode(node, batch, at);
    }

    // Mises en évidence
    for (const [id, start] of Object.entries(board.highlights)) {
      if (this.highlightsSeen.get(id) === start) continue;
      this.highlightsSeen.set(id, start);
      const target = this.items.get(id)?.mobjects[0];
      if (!target) continue;
      const isCurve = board.nodes[id]?.type === "curve";
      batch.push({
        animation: new Indicate(target, { duration: 1.2, scaleFactor: isCurve ? 1 : 1.2, color: BRAND.violet }),
        ...at(start, 1200),
      });
    }

    // Caméra : zoom demandé par le modèle, sinon recadrage quand le contenu change.
    if (board.camera && board.camera.at !== this.cameraAt) {
      this.cameraAt = board.camera.at;
      this.focused = board.camera.kind === "fit";
      const target =
        board.camera.kind === "reset"
          ? fitView(this.homeBox(), this.viewport)
          : fitView(this.mathBox(board.camera.x, board.camera.y), this.viewport, 0.85);
      this.userMoved = false;
      this.animateView(target, board.camera.duration, board.camera.at - now);
    }
    const contentKey = this.contentKey();
    if (contentKey !== this.lastContentKey) {
      this.lastContentKey = contentKey;
      if (!this.userMoved && !this.focused) this.animateView(fitView(this.homeBox(), this.viewport), 700, 0);
    }

    if (batch.length > 0) this.enqueue(batch);
  }

  /** Un nœud : apparition, déplacement, transformation, estompage, effacement. */
  private syncNode(node: BoardNode, batch: TimedAnimation[], at: (start: number, durationMs: number) => Pick<TimedAnimation, "start" | "end">) {
    let rendered = this.items.get(node.id);
    const fresh = !rendered || rendered.revealStart !== node.reveal.start;

    if (fresh) {
      if (rendered) this.scene.remove(...rendered.mobjects);
      // Un nœud qui apparaît puis bouge dans la même étape est dessiné à son point de départ,
      // et ses déplacements de cette étape restent à jouer.
      const pending = (node.motions ?? []).filter((m) => m.start >= node.reveal.start);
      const startOffset = pending[0]?.from ?? node.offset;
      const built = this.build(node, startOffset);
      rendered = {
        revealStart: node.reveal.start,
        mobjects: built.mobjects,
        erased: false,
        appliedOffset: startOffset,
        motionStart: pending.length > 0 ? -Infinity : lastMotion(node)?.start,
        morphStart: node.morph?.start,
        opacity: 1,
      };
      this.items.set(node.id, rendered);
      if (node.reveal.duration <= INSTANT_MS) {
        // Apparition instantanée (une copie posée sur son original) : pas d'animation d'entrée,
        // qui se battrait avec le glissement qui suit.
        this.scene.add(...built.mobjects);
      } else {
        for (const anim of built.animations) {
          const start = node.reveal.start + anim.delay * node.reveal.duration;
          const duration = anim.share * node.reveal.duration;
          batch.push({ animation: anim.make(duration / 1000), ...at(start, duration) });
        }
      }
    }
    const current = rendered!;

    // Transformation : les nouveaux mobjects remplacent les anciens en se transformant.
    if (!fresh && node.morph && node.morph.start !== current.morphStart) {
      current.morphStart = node.morph.start;
      const built = this.build(node, node.offset);
      for (const mobject of built.mobjects) mobject.opacity = current.opacity;
      const seconds = node.morph.duration / 1000;
      const [oldMain, ...oldRest] = current.mobjects;
      const [newMain, ...newRest] = built.mobjects;
      if (oldMain && newMain) {
        if (node.type === "text") {
          // Le texte de manim-web n'est pas un tracé vectoriel : l'ancien glisse et s'efface pendant que le nouveau s'écrit.
          batch.push({ animation: new FadeOut(oldMain, { duration: seconds * 0.6, shift: [0, 0.22, 0] }), ...at(node.morph.start, node.morph.duration * 0.6) });
          batch.push({
            animation: new FadeIn(newMain, { duration: seconds * 0.7, shift: [0, 0.22, 0] }),
            ...at(node.morph.start + node.morph.duration * 0.3, node.morph.duration * 0.7),
          });
        } else {
          batch.push({ animation: new ReplacementTransform(oldMain, newMain, { duration: seconds }), ...at(node.morph.start, node.morph.duration) });
        }
      }
      for (const old of oldRest) batch.push({ animation: new FadeOut(old, { duration: seconds * 0.5 }), ...at(node.morph.start, node.morph.duration * 0.5) });
      for (const extra of newRest) {
        batch.push({ animation: new FadeIn(extra, { duration: seconds * 0.5 }), ...at(node.morph.start + node.morph.duration * 0.5, node.morph.duration * 0.5) });
      }
      current.mobjects = built.mobjects;
      current.appliedOffset = node.offset;
      current.motionStart = lastMotion(node)?.start;
    }

    // Déplacements : chacun des nouveaux, dans l'ordre (aller puis retour, par exemple).
    const since = current.motionStart ?? -Infinity;
    for (const motion of (node.motions ?? []).filter((m) => m.start > since)) {
      current.motionStart = motion.start;
      const delta = this.worldDelta([motion.to[0] - current.appliedOffset[0], motion.to[1] - current.appliedOffset[1]]);
      current.appliedOffset = motion.to;
      if (delta[0] === 0 && delta[1] === 0) continue;
      for (const mobject of current.mobjects) {
        batch.push({ animation: slide(mobject, delta, motion.duration / 1000), ...at(motion.start, motion.duration) });
      }
    }

    // Estompage
    if (node.dim && node.dim.start !== current.dimStart) {
      current.dimStart = node.dim.start;
      const from = current.opacity;
      const to = node.dim.on ? DIMMED : 1;
      current.opacity = to;
      for (const mobject of current.mobjects) {
        const fade = new UpdateFromAlphaFunc(
          mobject,
          (m, alpha) => {
            m.opacity = from + (to - from) * alpha;
          },
          { duration: node.dim.duration / 1000 },
        );
        batch.push({ animation: fade, ...at(node.dim.start, node.dim.duration) });
      }
    }

    // Effacement
    if (node.erased && !current.erased) {
      current.erased = true;
      for (const mobject of current.mobjects) {
        batch.push({ animation: new FadeOut(mobject, { duration: node.erased.duration / 1000 }), ...at(node.erased.start, node.erased.duration) });
      }
    }
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
    this.focused = false;
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
    this.axesClearedAt = null;
    this.cameraAt = null;
    this.focused = false;
    this.lastContentKey = "";
    this.frame = DEFAULT_FRAME;
    this.axes = this.coordinatesFor(DEFAULT_FRAME);
    this.userMoved = false;
    this.board = null;
    this.animateView(fitView(this.homeBox(), this.viewport), 400, 0);
  }

  /** Repère (même échelle en x et en y, centré à l'origine) qui sert aussi à convertir les coordonnées. */
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
    if (frame.xLabel) labels.push(this.label(frame.xLabel, add(this.p(frame.x[1], oy), [-0.15, 0.35, 0]), BRAND.ink, FONT_SIZE.label));
    if (frame.yLabel) labels.push(this.label(frame.yLabel, add(this.p(ox, frame.y[1]), [0.4, -0.1, 0]), BRAND.ink, FONT_SIZE.label));
    return labels;
  }

  private p(x: number, y: number): Vec3 {
    return this.axes!.c2p(x, y) as Vec3;
  }

  /** Une longueur mathématique, en unités du monde. */
  private worldLength(length: number): number {
    const [dx] = this.worldDelta([length, 0]);
    return Math.abs(dx);
  }

  /** Un déplacement mathématique, en unités du monde. */
  private worldDelta([dx, dy]: Vec2): Vec3 {
    const a = this.p(0, 0);
    const b = this.p(dx, dy);
    return [b[0] - a[0], b[1] - a[1], 0];
  }

  private label(text: string, at: Vec3, color: string, size: number = FONT_SIZE.label, font: "hand" | "body" = "hand"): Mobject {
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

  /** Construit les mobjects d'un nœud, décalés de `offset`, et décrit leurs animations d'apparition. */
  private build(node: BoardNode, offset: Vec2): { mobjects: Mobject[]; animations: PlannedAnimation[] } {
    const built = this.buildShape(node);
    const delta = this.worldDelta(offset);
    if (delta[0] !== 0 || delta[1] !== 0) for (const mobject of built.mobjects) mobject.shift(delta);
    return built;
  }

  /**
   * Les mobjects d'un nœud à sa position dessinée. `delay` et `share` sont des
   * fractions de la durée d'apparition prévue.
   */
  private buildShape(node: BoardNode): { mobjects: Mobject[]; animations: PlannedAnimation[] } {
    const color = STROKE[node.color ?? (node.type === "curve" ? "blue" : node.type === "vector" ? "violet" : "ink")];
    switch (node.type) {
      case "curve": {
        const f = compileExpression(node.fn);
        const pieces = sampleCurve(node.fn, this.frame, node.from, node.to);
        const graphs = pieces.map((piece) => {
          const graph = this.axes!.plot(f, { xRange: [piece[0]![0], piece.at(-1)![0]], color, strokeWidth: node.style === "dotted" ? 7 : 4.5, numSamples: 160 });
          if (node.style === "dashed" || node.style === "dotted") {
            const length = Math.abs(piece.at(-1)![0] - piece[0]![0]);
            return new DashedVMobject({ vmobject: graph as unknown as VMobject, numDashes: Math.max(8, Math.round(length * 6)), dashRatio: node.style === "dotted" ? 0.08 : 0.55 });
          }
          return graph;
        });
        const mobjects: Mobject[] = [...graphs];
        const animations: PlannedAnimation[] = graphs.map((graph, i) => ({
          delay: i / Math.max(1, graphs.length),
          share: 1 / Math.max(1, graphs.length),
          make: (s: number) => new Create(graph, { duration: s }) as Animation,
        }));
        const last = pieces.at(-1)?.at(-1);
        if (node.label && last) {
          const text = this.label(node.label, add(this.p(last[0], last[1]), [0.3, 0.3, 0]), color);
          mobjects.push(text);
          animations.push({ delay: 0.85, share: 0.15, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "point": {
        const center = this.p(node.at[0], node.at[1]);
        const dot = new Dot({ point: center, radius: 0.085, color });
        const mobjects: Mobject[] = [dot];
        const animations: PlannedAnimation[] = [{ delay: 0, share: 0.6, make: (s) => new GrowFromCenter(dot, { duration: s }) }];
        if (node.ring) {
          const ring = new Circle({ radius: 0.2, color, strokeWidth: 3, center });
          mobjects.push(ring);
          animations.push({ delay: 0.2, share: 0.8, make: (s) => new Create(ring, { duration: s }) });
        }
        if (node.label) {
          const text = this.label(node.label, add(center, [0.25, 0.42, 0]), BRAND.ink);
          text.shift([textHalfWidth(text), 0, 0]);
          mobjects.push(text);
          animations.push({ delay: 0.4, share: 0.6, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "vector":
      case "segment": {
        const from = this.p(node.from[0], node.from[1]);
        const to = this.p(node.to[0], node.to[1]);
        const mobjects: Mobject[] = [];
        const animations: PlannedAnimation[] = [];
        if (node.type === "vector") {
          const arrow = new Arrow({ start: from, end: to, color, strokeWidth: 5, tipLength: 0.22, tipWidth: 0.2 });
          mobjects.push(arrow);
          animations.push({ delay: 0, share: 1, make: (s) => new GrowArrow(arrow, { duration: s }) });
        } else {
          const line = node.dashed
            ? new DashedLine({ start: from, end: to, color, strokeWidth: 3, dashLength: 0.12 })
            : new Line({ start: from, end: to, color, strokeWidth: 3.5 });
          mobjects.push(line);
          animations.push({ delay: 0, share: 1, make: (s) => new Create(line, { duration: s }) });
        }
        if (node.label) {
          const anchor = node.type === "vector" ? to : mid(from, to);
          const normal = perpendicular(from, to, this.p(0, 0));
          const text = this.label(node.label, add(anchor, scale(normal, 0.38)), color);
          mobjects.push(text);
          animations.push({ delay: 0.6, share: 0.4, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "arc": {
        const center = this.p(node.center[0], node.center[1]);
        const radius = this.worldLength(node.radius);
        const arc = new Arc({ center, radius, startAngle: rad(node.start), angle: rad(node.end - node.start), color, strokeWidth: 3 });
        const mobjects: Mobject[] = [arc];
        const animations: PlannedAnimation[] = [{ delay: 0, share: 0.7, make: (s) => new Create(arc, { duration: s }) }];
        if (node.label) {
          // Étiquette sur la bissectrice, juste à l'extérieur de l'arc.
          const middle = rad((node.start + node.end) / 2);
          const text = this.label(node.label, add(center, [Math.cos(middle) * (radius + 0.32), Math.sin(middle) * (radius + 0.32), 0]), color);
          mobjects.push(text);
          animations.push({ delay: 0.5, share: 0.5, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "circle": {
        const center = this.p(node.center[0], node.center[1]);
        const radius = this.worldLength(node.radius);
        const circle = new Circle({ center, radius, color, strokeWidth: 3.5 });
        const shape = node.dashed ? new DashedVMobject({ vmobject: circle as unknown as VMobject, numDashes: Math.max(16, Math.round(radius * 12)), dashRatio: 0.55 }) : circle;
        const mobjects: Mobject[] = [shape];
        const animations: PlannedAnimation[] = [{ delay: 0, share: 0.85, make: (s) => new Create(shape, { duration: s }) as Animation }];
        if (node.label) {
          const text = this.label(node.label, add(center, [radius * 0.72 + 0.2, radius * 0.72 + 0.25, 0]), color);
          text.shift([textHalfWidth(text), 0, 0]);
          mobjects.push(text);
          animations.push({ delay: 0.7, share: 0.3, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "polygon": {
        const vertices = node.points.map(([x, y]) => this.p(x, y));
        const polygon = new Polygon({ vertices, color, fillOpacity: node.fill ? 0.16 : 0, strokeWidth: 3.2, closed: node.closed });
        const mobjects: Mobject[] = [polygon];
        const animations: PlannedAnimation[] = [{ delay: 0, share: 0.85, make: (s) => new Create(polygon, { duration: s }) }];
        if (node.label) {
          const center = vertices.reduce((acc, v) => add(acc, scale(v, 1 / vertices.length)), [0, 0, 0] as Vec3);
          const text = this.label(node.label, center, color);
          mobjects.push(text);
          animations.push({ delay: 0.7, share: 0.3, make: (s) => new FadeIn(text, { duration: s }) });
        }
        return { mobjects, animations };
      }
      case "text": {
        const text = this.label(node.text, this.p(node.at[0], node.at[1]), color, fontSizeOf(node));
        // Ligne de calcul : alignée à gauche sur sa colonne.
        if (node.align === "left") text.shift([textHalfWidth(text), 0, 0]);
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

  /** Tout ce qui est au tableau (figure, textes, calculs), en unités du monde. */
  private homeBox(): WorldBox {
    if (!this.board) return this.mathBox(this.frame.x, this.frame.y, 0.6);
    const box = contentBox(this.board);
    return this.mathBox([box.x0, box.x1], [box.y0, box.y1], 0.5);
  }

  /** Clé du contenu : quand elle change, la caméra recadre (si l'élève n'a pas bougé la vue). */
  private contentKey(): string {
    if (!this.board) return "";
    const box = contentBox(this.board);
    return [box.x0, box.y0, box.x1, box.y1].map((v) => v.toFixed(2)).join(",");
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
const rad = (degrees: number) => (degrees * Math.PI) / 180;
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

/**
 * Glissement relatif : chaque image ajoute la part de chemin parcourue depuis
 * la précédente. Contrairement à Shift, qui retient sa position de départ dès
 * que le lot d'animations commence, deux glissements du même objet dans une
 * étape s'enchaînent correctement (aller, puis retour).
 */
function slide(mobject: Mobject, delta: Vec3, seconds: number): Animation {
  let done = 0;
  return new UpdateFromAlphaFunc(
    mobject,
    (m, alpha) => {
      const step = alpha - done;
      done = alpha;
      if (step !== 0) m.shift([delta[0] * step, delta[1] * step, 0]);
    },
    { duration: seconds },
  );
}
