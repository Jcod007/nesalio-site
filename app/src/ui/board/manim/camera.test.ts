import { describe, expect, it } from "vitest";
import { fitView, gridFor, lerpView, panBy, screenToWorld, zoomAt, type Viewport } from "./camera";

const viewport: Viewport = { width: 1000, height: 600, insets: { top: 0, right: 200, bottom: 200, left: 0 } };

describe("caméra", () => {
  it("cadre la boîte au centre de la zone visible", () => {
    const view = fitView({ x: 0, y: 0, width: 8, height: 4 }, viewport, 1);
    expect(view.s).toBe(100); // 800 / 8 = 100, 400 / 4 = 100
    // Le centre de la boîte apparaît au centre de la zone visible (400, 200).
    const [wx, wy] = screenToWorld(view, viewport, 400, 200);
    expect(wx).toBeCloseTo(0);
    expect(wy).toBeCloseTo(0);
  });

  it("zoome autour du curseur sans déplacer le point visé", () => {
    const view = { cx: 1, cy: 2, s: 50 };
    const before = screenToWorld(view, viewport, 300, 150);
    const zoomed = zoomAt(view, viewport, 2, 300, 150);
    expect(zoomed.s).toBe(100);
    const after = screenToWorld(zoomed, viewport, 300, 150);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("déplace la vue dans le sens du glisser", () => {
    const moved = panBy({ cx: 0, cy: 0, s: 100 }, 100, 50);
    expect(moved).toEqual({ cx: -1, cy: 0.5, s: 100 });
  });

  it("interpole d'une vue à l'autre", () => {
    const a = { cx: 0, cy: 0, s: 10 };
    const b = { cx: 10, cy: -4, s: 1000 };
    expect(lerpView(a, b, 0)).toEqual(a);
    expect(lerpView(a, b, 1)).toEqual(b);
    expect(lerpView(a, b, 0.5).s).toBeCloseTo(100);
  });

  it("garde des cases de quadrillage lisibles à tous les zooms", () => {
    for (const s of [8, 40, 100, 900]) {
      const grid = gridFor({ cx: 0.3, cy: -0.2, s }, viewport);
      expect(grid.size).toBeGreaterThanOrEqual(14);
      expect(grid.size).toBeLessThanOrEqual(48);
      expect(grid.x).toBeGreaterThanOrEqual(0);
      expect(grid.x).toBeLessThan(grid.size);
    }
  });
});
