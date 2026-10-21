import { describe, expect, it } from "vitest";
import { axisBeside, gapFor, homothetyCenter, translationBeside } from "./apart";
import type { Box } from "./layout";
import type { Vec2 } from "./state";

const box: Box = { x0: 1, y0: 0, x1: 4, y1: 2 };
const imageBox = (points: Vec2[]): Box => ({
  x0: Math.min(...points.map((p) => p[0])),
  y0: Math.min(...points.map((p) => p[1])),
  x1: Math.max(...points.map((p) => p[0])),
  y1: Math.max(...points.map((p) => p[1])),
});
const corners = (b: Box): Vec2[] => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
/** L'image est séparée de la figure d'au moins l'écart, à gauche ou à droite. */
const apart = (b: Box, image: Box, gap: number) => image.x0 >= b.x1 + gap - 1e-9 || image.x1 <= b.x0 - gap + 1e-9 || image.y1 <= b.y0 - gap + 1e-9;

describe("placement d'une transformation à côté de la figure", () => {
  const g = gapFor(box);

  it("réflexion : l'axe à côté, l'image séparée de la figure", () => {
    const [a] = axisBeside(box, "vertical");
    const image = imageBox(corners(box).map(([x, y]) => [2 * a[0] - x, y]));
    expect(apart(box, image, g)).toBe(true);
    const [h] = axisBeside(box, "horizontal");
    expect(apart(box, imageBox(corners(box).map(([x, y]) => [x, 2 * h[1] - y])), g)).toBe(true);
  });

  it("translation : l'image juste à droite", () => {
    const [dx, dy] = translationBeside(box);
    expect(apart(box, imageBox(corners(box).map(([x, y]) => [x + dx, y + dy])), g)).toBe(true);
  });

  it.each([2, 3, 0.5, 0.25, -1, -0.5, 1.5])("homothétie de rapport %s : l'image ne recouvre pas la figure", (k) => {
    const c = homothetyCenter(box, k);
    const image = imageBox(corners(box).map(([x, y]) => [c[0] + k * (x - c[0]), c[1] + k * (y - c[1])]));
    expect(apart(box, image, Math.abs(k) < 1 && k > 0 ? g : 0)).toBe(true);
    // Le centre n'est pas sur la figure.
    expect(c[0] < box.x0 || c[0] > box.x1).toBe(true);
  });
});
