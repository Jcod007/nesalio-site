/**
 * Gestes sur le tableau infini : molette (zoom ou déplacement), glisser
 * (déplacement) et pincer (zoom tactile). Ils ne font que calculer la vue
 * demandée (calculs purs de camera.ts) ; le rendu l'applique.
 */
import { panBy, zoomAt, type View, type Viewport } from "./camera";

export interface CameraControl {
  view(): View;
  viewport(): Viewport;
  /** L'élève a déplacé ou zoomé la vue. */
  moveTo(view: View): void;
}

/** Branche les gestes sur `el` ; renvoie la fonction qui les débranche. */
export function attachGestures(el: HTMLElement, camera: CameraControl): () => void {
  const local = (event: { clientX: number; clientY: number }) => {
    const rect = el.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top] as const;
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const [x, y] = local(event);
    if (event.ctrlKey || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
      camera.moveTo(zoomAt(camera.view(), camera.viewport(), Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), x, y));
    } else {
      camera.moveTo(panBy(camera.view(), -event.deltaX, -event.deltaY));
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
      camera.moveTo(panBy(camera.view(), x - previous.x, y - previous.y));
    } else if (pointers.size === 2) {
      const points = [...pointers.values()];
      const d = distance(points);
      const cx = (points[0]!.x + points[1]!.x) / 2;
      const cy = (points[0]!.y + points[1]!.y) / 2;
      if (pinchDistance > 0) camera.moveTo(zoomAt(camera.view(), camera.viewport(), d / pinchDistance, cx, cy));
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
  return () => {
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
  };
}

function distance(points: Array<{ x: number; y: number }>) {
  const [a, b] = points;
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
