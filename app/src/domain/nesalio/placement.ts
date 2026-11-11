import type { Group, SceneObject } from "./contract";

export type Point = readonly [number, number];
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export type Layout = NonNullable<SceneObject["layout"]>;
type Direction = NonNullable<Group["arrange"]>["direction"];
type Align = NonNullable<NonNullable<Group["arrange"]>["align"]>;
export type Gap = NonNullable<NonNullable<Group["arrange"]>["gap"]>;
const gaps: Record<Gap, number> = { xs: 0.1, sm: 0.25, md: 0.5, lg: 0.85, xl: 1.25 };
export const gapSize = (gap: Gap = "sm"): number => gaps[gap];

export function center(box: Box): Point {
  return [box.x0 / 2 + box.x1 / 2, box.y0 / 2 + box.y1 / 2];
}

export function translate(box: Box, [x, y]: Point): Box {
  return { x0: box.x0 + x, y0: box.y0 + y, x1: box.x1 + x, y1: box.y1 + y };
}

export function union(boxes: Iterable<Box | null>): Box | null {
  let result: Box | null = null;
  for (const box of boxes) {
    if (!box) continue;
    result = result
      ? {
          x0: Math.min(result.x0, box.x0),
          y0: Math.min(result.y0, box.y0),
          x1: Math.max(result.x1, box.x1),
          y1: Math.max(result.y1, box.y1),
        }
      : box;
  }
  return result;
}

export function intersects(a: Box, b: Box): boolean {
  const epsilon = 1e-9;
  return a.x1 > b.x0 + epsilon && a.x0 < b.x1 - epsilon && a.y1 > b.y0 + epsilon && a.y0 < b.y1 - epsilon;
}

export function beside(box: Box, reference: Box, direction: Direction, gap: number, align?: Align): Point {
  const [x, y] = center(box);
  const [rx, ry] = center(reference);
  switch (direction) {
    case "right":
    case "left":
      return [
        direction === "right" ? reference.x1 + gap - box.x0 : reference.x0 - gap - box.x1,
        align === "top" ? reference.y1 - box.y1 : align === "bottom" ? reference.y0 - box.y0 : ry - y,
      ];
    case "up":
    case "down":
      return [
        align === "left" ? reference.x0 - box.x0 : align === "right" ? reference.x1 - box.x1 : rx - x,
        direction === "up" ? reference.y1 + gap - box.y0 : reference.y0 - gap - box.y1,
      ];
  }
}

/**
 * Shift of `box` for a layout against `reference` (an object's box, or the visible area
 * for to_edge / to_corner). to_edge keeps the other coordinate, like Manim's to_edge.
 */
export function positionFor(box: Box, reference: Box, layout: Layout, gap: number): Point {
  if ("next_to" in layout) return beside(box, reference, layout.direction, layout.gap ? gapSize(layout.gap) : gap, layout.align);
  if ("to_edge" in layout || "to_corner" in layout) {
    const margin = gapSize(layout.gap ?? "md");
    const side = "to_edge" in layout ? layout.to_edge : undefined;
    const corner = "to_corner" in layout ? layout.to_corner : "";
    const left = side === "left" || corner.endsWith("left");
    const right = side === "right" || corner.endsWith("right");
    const top = side === "up" || corner.startsWith("top");
    const bottom = side === "down" || corner.startsWith("bottom");
    return [
      left ? reference.x0 + margin - box.x0 : right ? reference.x1 - margin - box.x1 : 0,
      top ? reference.y1 - margin - box.y1 : bottom ? reference.y0 + margin - box.y0 : 0,
    ];
  }
  const [x, y] = center(box);
  const [rx, ry] = center(reference);
  if ("center_on" in layout) return [rx - x, ry - y];
  switch (layout.align) {
    case "left":
      return [reference.x0 - box.x0, 0];
    case "right":
      return [reference.x1 - box.x1, 0];
    case "top":
      return [0, reference.y1 - box.y1];
    case "bottom":
      return [0, reference.y0 - box.y0];
    case "center":
      return [rx - x, 0];
  }
}

/** Move along the given axis while preserving the other coordinate. */
export function avoidOverlap(box: Box, position: Point, obstacles: readonly Box[], axis: 0 | 1, gap: number, direction = 0): Point {
  const placed = translate(box, position);
  if (!obstacles.some((obstacle) => intersects(placed, obstacle))) return position;
  const shifts = obstacles
    .flatMap((obstacle) =>
      axis === 0 ? [obstacle.x0 - placed.x1 - gap, obstacle.x1 - placed.x0 + gap] : [obstacle.y0 - placed.y1 - gap, obstacle.y1 - placed.y0 + gap],
    )
    .filter((shift) => direction === 0 || shift * direction > 0)
    .sort((a, b) => Math.abs(a) - Math.abs(b));
  for (const shift of shifts) {
    const candidate: Point = axis === 0 ? [position[0] + shift, position[1]] : [position[0], position[1] + shift];
    if (!obstacles.some((obstacle) => intersects(translate(box, candidate), obstacle))) return candidate;
  }
  throw new Error("Aucun placement disponible.");
}
