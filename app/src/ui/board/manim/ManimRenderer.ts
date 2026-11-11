/**
 * Le tableau de Nesalio avec manim-web : la scène, sa projection (NesalioProjection dessine chaque image que le
 * lecteur calcule) et la caméra de l'écran. Le lecteur décide du cadrage à chaque image ; une fois la leçon finie,
 * l'élève peut encore déplacer et zoomer le tableau (molette, glisser, pincer).
 *
 * L'ancien rendu du tuteur (graphe de scène BoardState, animations planifiées) a été retiré le 2026-11-10.
 */
import { MathTex, Scene, registerTheme, setTheme } from "manim-web";
import { BRAND } from "@/ui/theme";
import { gridFor, panBy, zoomAt, type View, type Viewport } from "./camera";
import { NesalioProjection } from "./NesalioProjection";
import type { NesalioFrame } from "@/engine/nesalioPlayback";

let themeReady = false;
function ensureTheme() {
  if (themeReady) return;
  registerTheme("nesalio", { strokeColor: BRAND.ink, fillColor: BRAND.ink, background: BRAND.paper });
  setTheme("nesalio");
  themeReady = true;
}

/** The lesson's design frame when nothing has been drawn yet (16:9 around the origin). */
const HOME = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };

export class ManimRenderer {
  private readonly scene: Scene;
  private readonly container: HTMLElement;
  private viewport: Viewport;
  private view: View = { cx: 0, cy: 0, s: 60 };
  private readonly detach: Array<() => void> = [];
  private projection?: NesalioProjection;
  private nesalioCamera?: Pick<NesalioFrame["scene"], "camera" | "initialViewport">;

  constructor(container: HTMLElement) {
    ensureTheme();
    this.container = container;
    this.scene = new Scene(container, { backgroundColor: BRAND.paper, backgroundOpacity: 0 });
    this.viewport = { width: container.clientWidth, height: container.clientHeight, insets: { top: 0, right: 0, bottom: 0, left: 0 } };
    this.attachInteractions();
    const observer = new ResizeObserver(() => this.handleResize());
    observer.observe(container);
    this.detach.push(() => observer.disconnect());
    this.applyNesalioView();
    // MathJax se charge à la première formule (gros module) : on le prépare pendant que l'élève lit.
    setTimeout(() => void new MathTex({ latex: "x" }).waitForRender().catch(() => undefined), 1500);
  }

  nesalioProjection(): NesalioProjection {
    // biome-ignore lint/suspicious/noAssignInExpressions: projection créée à la première demande
    return (this.projection ??= new NesalioProjection(this.scene));
  }

  drawNesalio(frame: NesalioFrame): void {
    this.nesalioProjection().draw(frame);
    this.nesalioCamera = frame.scene;
    this.applyNesalioView();
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.projection?.dispose();
    this.scene.dispose();
  }

  /** The lesson's camera (or the design frame before the first image), fitted to the screen. */
  private applyNesalioView(): void {
    const { width, height } = this.viewport;
    if (!width || !height) return;
    const { x, y, zoom } = this.nesalioCamera?.camera.state ?? { x: 0, y: 0, zoom: 1 };
    const box = this.nesalioCamera?.initialViewport ?? HOME;
    const scale = Math.min(width / (box.x1 - box.x0), height / (box.y1 - box.y0));
    this.applyView({ cx: x, cy: y, s: scale * zoom });
  }

  private applyView(view: View) {
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
  }

  private handleResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === this.viewport.width && height === this.viewport.height) return;
    this.viewport = { ...this.viewport, width, height };
    if (width > 0 && height > 0) this.scene.resize(width, height);
    this.applyNesalioView();
  }

  /** Molette (zoom), glisser (déplacement) et pincer (zoom tactile) : le lecteur reprend la main à l'image suivante. */
  private attachInteractions() {
    const el = this.container;
    const local = (event: { clientX: number; clientY: number }) => {
      const rect = el.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top] as const;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const [x, y] = local(event);
      if (event.ctrlKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
        this.applyView(zoomAt(this.view, this.viewport, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), x, y));
      } else {
        this.applyView(panBy(this.view, -event.deltaX, -event.deltaY));
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
        this.applyView(panBy(this.view, x - previous.x, y - previous.y));
      } else if (pointers.size === 2) {
        const points = [...pointers.values()];
        const d = distance(points);
        const cx = (points[0]!.x + points[1]!.x) / 2;
        const cy = (points[0]!.y + points[1]!.y) / 2;
        if (pinchDistance > 0) this.applyView(zoomAt(this.view, this.viewport, d / pinchDistance, cx, cy));
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

function distance(points: Array<{ x: number; y: number }>) {
  const [a, b] = points;
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
