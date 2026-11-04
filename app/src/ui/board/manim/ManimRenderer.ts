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
  Axes,
  Create,
  FadeIn,
  Indicate,
  MathTex,
  FadeOut,
  ReplacementTransform,
  Scene,
  Text,
  UpdateFromAlphaFunc,
  registerTheme,
  setTheme,
  type Mobject,
} from "manim-web";
import { axisTicks, contentBox, FONT_SIZE, labelCenter, scales, textWorldExtent, TICK_FONT, tickLabels } from "@/domain/board/layout";
import { hasMath, plainText, toLatex } from "@/domain/board/tex";
import { DEFAULT_FRAME, isVisible, lastMotion, type BoardNode, type BoardState, type Frame, type Vec2 } from "@/domain/board/state";
import { BRAND } from "@/ui/theme";
import { fitView, gridFor, lerpView, type View, type Viewport, type WorldBox } from "./camera";
import { attachGestures } from "./interactions";
import { fadeAll, slide, turn } from "./motion";
import { buildNode, type Pen } from "./nodeBuilders";
import { add, rad, type Built, type TimedAnimation, type Vec3 } from "./world";

/** Ce qui est dessiné pour un nœud du graphe, et ce qui en a déjà été animé. */
interface Rendered {
  revealStart: number;
  mobjects: Mobject[];
  erased: boolean;
  /** Déplacement cumulé déjà appliqué aux mobjects (coordonnées mathématiques). */
  appliedOffset: Vec2;
  /** Début du dernier déplacement déjà animé (les suivants restent à jouer). */
  motionStart?: number;
  /** Début de la dernière rotation déjà animée. */
  spinStart?: number;
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

  constructor(
    container: HTMLElement,
    private readonly callbacks: RendererCallbacks = {},
  ) {
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
    // MathJax se charge à la première formule (gros module) : on le prépare pendant que l'élève lit.
    setTimeout(() => void new MathTex({ latex: "x" }).waitForRender().catch(() => undefined), 1500);
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
      for (const old of this.axesMobjects) batch.push(...fadeAll(old, 0.4, at(board.axesCleared.start, 400)));
      this.axesMobjects = [];
      this.axesRevealStart = null;
    }

    // Repère
    if (board.axes && board.axes.reveal.start !== this.axesRevealStart) {
      for (const old of this.axesMobjects) batch.push(...fadeAll(old, 0.3, at(board.axes.reveal.start, 300)));
      const { start, duration } = board.axes.reveal;
      const reproject = this.items.size > 0 && JSON.stringify(this.frame) !== JSON.stringify(board.axes.frame);
      this.frame = board.axes.frame;
      this.axes = this.coordinatesFor(board.axes.frame);
      // Ce qui était déjà dessiné garde ses coordonnées mathématiques : on le redessine dans le nouveau repère.
      if (reproject) this.reproject(board);
      const labels = this.axesLabels(board.axes.frame);
      this.axesMobjects = [this.axes, ...labels];
      this.axesRevealStart = start;
      batch.push({ animation: new Create(this.axes, { duration: duration / 1000 }), ...at(start, duration) });
      for (const label of labels) {
        batch.push({ animation: new FadeIn(label, { duration: (duration * 0.5) / 1000 }), ...at(start + duration * 0.5, duration * 0.5) });
      }
    }

    // Sans repère, le cadre s'agrandit quand une figure en déborde (moteur : fitFrame) : le texte garde
    // sa taille à l'écran au lieu de rapetisser avec la caméra. Ce qui est déjà dessiné est redessiné
    // dans le nouveau cadre, et la vue compensée pour que l'image ne saute pas ; la caméra recadre ensuite.
    if (!board.axes && JSON.stringify(this.frame) !== JSON.stringify(board.frame)) {
      const before = this.frame;
      this.frame = board.frame;
      this.axes = this.coordinatesFor(board.frame);
      // Ce qui s'efface (un "clear" remet le cadre à sa taille) finit de disparaître où il est.
      if (board.order.some((id) => this.items.has(id) && isVisible(board.nodes[id]))) {
        this.reproject(board);
        this.keepPicture(before, board.frame);
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
      const highlighted = board.nodes[id];
      // Point vide : on fait pulser son cercle (le 2e mobject), pas le disque qui le remplit.
      const target = this.items.get(id)?.mobjects[highlighted?.type === "point" && highlighted.open ? 1 : 0];
      if (!target) continue;
      const isCurve = highlighted?.type === "curve";
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
        board.camera.kind === "reset" ? fitView(this.homeBox(), this.viewport) : fitView(this.mathBox(board.camera.x, board.camera.y), this.viewport, 0.85);
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

  /**
   * Redessine les nœuds déjà à l'écran dans le repère courant (nouvelle échelle),
   * à leur place finale, sans animation d'entrée.
   */
  private reproject(board: BoardState) {
    for (const [id, rendered] of this.items) {
      const node = board.nodes[id];
      if (rendered.erased || !node || node.erased) continue;
      this.scene.remove(...rendered.mobjects);
      const built = this.build(node, node.offset);
      for (const mobject of built.mobjects) mobject.opacity = rendered.opacity;
      this.scene.add(...built.mobjects);
      rendered.mobjects = built.mobjects;
      rendered.appliedOffset = node.offset;
      rendered.motionStart = lastMotion(node)?.start;
      rendered.spinStart = node.spins?.at(-1)?.start;
      rendered.morphStart = node.morph?.start;
    }
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
        // Le nœud est dessiné à sa place finale : ses rotations passées n'ont pas à être rejouées.
        spinStart: node.spins?.at(-1)?.start,
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
      if (node.type === "grid") {
        // Chaque ligne du quadrillage devient son image : tout le plan se déforme d'un seul mouvement.
        current.mobjects.forEach((old, i) => {
          const fresh = built.mobjects[i];
          if (fresh) batch.push({ animation: new ReplacementTransform(old, fresh, { duration: seconds }), ...at(node.morph!.start, node.morph!.duration) });
        });
      } else if (oldMain && newMain) {
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
      for (const old of node.type === "grid" ? [] : oldRest)
        batch.push({ animation: new FadeOut(old, { duration: seconds * 0.5 }), ...at(node.morph.start, node.morph.duration * 0.5) });
      for (const extra of node.type === "grid" ? [] : newRest) {
        batch.push({
          animation: new FadeIn(extra, { duration: seconds * 0.5 }),
          ...at(node.morph.start + node.morph.duration * 0.5, node.morph.duration * 0.5),
        });
      }
      current.mobjects = built.mobjects;
      current.appliedOffset = node.offset;
      current.motionStart = lastMotion(node)?.start;
      current.spinStart = node.spins?.at(-1)?.start;
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

    // Rotations : la forme tourne autour du pivot ; ses étiquettes glissent sur l'arc sans se renverser.
    const spun = current.spinStart ?? -Infinity;
    for (const spin of (node.spins ?? []).filter((x) => x.start > spun)) {
      current.spinStart = spin.start;
      const pivot = this.p(spin.about[0], spin.about[1]);
      current.mobjects.forEach((mobject, i) => {
        const turnShape = i === 0 && node.type !== "text";
        batch.push({ animation: turn(mobject, pivot, rad(spin.angle), turnShape, spin.duration / 1000), ...at(spin.start, spin.duration) });
      });
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
    const unit = scales(frame);
    const ticks = axisTicks(frame);
    return new Axes({
      xRange: [frame.x[0], frame.x[1], ticks.x.step],
      yRange: [frame.y[0], frame.y[1], ticks.y.step],
      xLength: dx * unit.x,
      yLength: dy * unit.y,
      color: BRAND.ink,
      axisConfig: { color: BRAND.ink, strokeWidth: 2.5, tickSize: 0.12 },
      tips: true,
      tipLength: 0.18,
    });
  }

  /** Graduations chiffrées et noms des axes (le repère courant doit être `this.axes`). */
  private axesLabels(frame: Frame): Mobject[] {
    // Les chiffres sont ceux que le moteur connaît (il les évite en plaçant les textes).
    const labels: Mobject[] = tickLabels(frame).map((tick) => this.label(tick.text, this.p(tick.at[0], tick.at[1]), BRAND.muted, TICK_FONT, "body"));
    const oy = clampTo(0, frame.y);
    const ox = clampTo(0, frame.x);
    if (frame.xLabel) labels.push(this.label(frame.xLabel, add(this.p(frame.x[1], oy), [-0.15, 0.35, 0]), BRAND.ink, FONT_SIZE.label));
    if (frame.yLabel) labels.push(this.label(frame.yLabel, add(this.p(ox, frame.y[1]), [0.4, -0.1, 0]), BRAND.ink, FONT_SIZE.label));
    return labels;
  }

  /** Centre de l'étiquette d'un nœud, à l'écran (la même place que celle que le moteur évite). */
  private labelPoint(node: BoardNode): Vec3 | null {
    const at = labelCenter(node, this.frame);
    return at ? this.p(at[0], at[1]) : null;
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
    if (hasMath(text)) return this.math(text, at, color, size);
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
   * Texte avec formules (entre dollars) : rendu par MathJax, puis ajusté à la boîte que le moteur
   * lui a réservée (textWorldExtent) pour ne pas déborder sur ses voisins. Le rendu est asynchrone ;
   * l'ajustement garde le centre où il est (un déplacement déjà appliqué est conservé). Si la
   * formule ne se compile pas, elle s'écrit en texte simple.
   */
  private math(text: string, at: Vec3, color: string, size: number): Mobject {
    const box = textWorldExtent(text, size);
    const mobject = new MathTex({ latex: toLatex(text), color, fontSize: size, position: at });
    const generation = this.generation;
    void mobject.waitForRender().then(() => {
      if (generation !== this.generation) return;
      const center = mobject.getCenter();
      if (mobject.getRenderError()) {
        const fallback = new Text({ text: plainText(text), fontSize: size, fontFamily: HAND_FONT, fontWeight: 600, color });
        fallback.moveTo(center);
        mobject.add(fallback);
      } else {
        const w = mobject.getWidth();
        const h = mobject.getHeight();
        if (w > 0 && h > 0) {
          mobject.scale(Math.min(box.w / w, box.h / h));
          mobject.moveTo(center);
        }
      }
      this.scene.render();
    });
    return mobject;
  }

  /** Construit les mobjects d'un nœud, décalés de `offset`, et décrit leurs animations d'apparition. */
  private build(node: BoardNode, offset: Vec2): Built {
    const built = buildNode(node, this.pen());
    const delta = this.worldDelta(offset);
    if (delta[0] !== 0 || delta[1] !== 0) for (const mobject of built.mobjects) mobject.shift(delta);
    return built;
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

  /** Vue qui montre la même image après un changement de cadre (même échelle en x et en y). */
  private keepPicture(before: Frame, after: Frame) {
    if (this.cameraTimer) clearTimeout(this.cameraTimer);
    cancelAnimationFrame(this.cameraTween);
    const u0 = scales(before).x;
    const u1 = scales(after).x;
    const k = u1 / u0;
    const mid = (f: Frame, axis: "x" | "y") => (f[axis][0] + f[axis][1]) / 2;
    this.applyView(
      {
        s: this.view.s / k,
        cx: (mid(before, "x") - mid(after, "x")) * u1 + k * this.view.cx,
        cy: (mid(before, "y") - mid(after, "y")) * u1 + k * this.view.cy,
      },
      this.userMoved,
    );
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
    const detach = attachGestures(this.container, {
      view: () => this.view,
      viewport: () => this.viewport,
      moveTo: (view) => {
        this.userMoved = true;
        if (this.cameraTimer) clearTimeout(this.cameraTimer);
        cancelAnimationFrame(this.cameraTween);
        this.applyView(view, true);
      },
    });
    this.detach.push(detach);
  }

  /** Le repère courant et ses conversions, prêtés aux constructeurs de nœuds. */
  private pen(): Pen {
    return {
      frame: this.frame,
      axes: this.axes!,
      p: (x, y) => this.p(x, y),
      worldLength: (length) => this.worldLength(length),
      label: (text, at, color, size, font) => this.label(text, at, color, size, font),
      labelPoint: (node) => this.labelPoint(node),
    };
  }
}

/* ------------------------------- petits outils ------------------------------- */

function clampTo(v: number, [a, b]: [number, number]) {
  return v < a ? a : v > b ? b : v;
}
