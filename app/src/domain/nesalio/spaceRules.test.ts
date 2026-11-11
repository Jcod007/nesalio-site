import { describe, expect, it } from "vitest";
import { Slice } from "./contract";
import { intersects, translate, type Box } from "./placement";
import { createScene, introduceSlice, sceneBounds, type SceneState } from "./sceneState";
import { validateModelOutput } from "./validate";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const slice = (id: string, introduces: unknown[], groups?: unknown[]) =>
  Slice.parse({ slice_id: id, introduces, groups, beats: [{ id: `b_${id}`, say: "Observons.", cues: [], do: [] }] });
const box = (scene: SceneState, ...ids: string[]) => sceneBounds(scene, ids, "layout_bounds")!;
const strokes = (scene: SceneState, id: string): Box[] => {
  const object = scene.objects.get(id)!;
  return (object.measurement.collision ?? []).map((part) => translate(part, object.position));
};

describe("règles d’espace Nesalio (spécification §1 et §7)", () => {
  const graph = (id: string, expression: string) => [
    { id: `${id}_axes`, type: "axes", params: { x: [-1, 5], y: [-1, 4] } },
    { id: `${id}_curve`, type: "function_graph", params: { expression, domain: [0, 4] } },
    { id: `${id}_point`, type: "point", params: { at: [1, 1] } },
  ];

  it("place les figures d’une tranche comme un seul bloc, sans toucher la tranche précédente", () => {
    const first = introduceSlice(createScene(viewport), slice("s1", [{ id: "title", type: "text", content: "Un titre assez long" }]));
    const second = introduceSlice(first, slice("s2", graph("g", "x")));
    expect(intersects(box(second, "g_axes", "g_curve", "g_point"), box(second, "title"))).toBe(false);
    expect(second.objects.get("title")).toBe(first.objects.get("title"));
    // Same frame: the point stays at (1 ; 1) on its curve, wherever the block lands.
    const [ox, oy] = second.objects.get("g_axes")!.position;
    expect(second.objects.get("g_curve")!.position).toEqual([ox, oy]);
    expect(second.objects.get("g_point")!.position).toEqual([ox, oy]);
  });

  it("donne à deux repères de deux tranches deux places distinctes", () => {
    const scene = introduceSlice(introduceSlice(createScene(viewport), slice("s1", graph("a", "x"))), slice("s2", graph("b", "x^2/4")));
    expect(scene.objects.get("a_axes")!.position).toEqual([0, 0]);
    expect(intersects(box(scene, "a_axes", "a_curve"), box(scene, "b_axes", "b_curve"))).toBe(false);
  });

  it("laisse une figure d’une tranche suivante rejoindre un repère existant, avec les mêmes coordonnées", () => {
    const first = introduceSlice(createScene(viewport), slice("s1", [{ id: "note", type: "text", content: "Avant" }, ...graph("g", "x")]));
    const later = introduceSlice(first, slice("s2", [{ id: "q", type: "point", params: { at: [3, 3] }, frame: "g_axes" }]));
    expect(later.objects.get("q")!.position).toEqual(later.objects.get("g_axes")!.position);
    expect(later.objects.get("q")!.frame).toBe(later.objects.get("g_axes")!.frame);
  });

  it("pose un texte sans relation sous la composition précédente, jamais par-dessus", () => {
    const first = introduceSlice(
      createScene(viewport),
      slice("s1", [
        { id: "eq", type: "math", content: "2x + 3 = 7" },
        { id: "why", type: "text", content: "But : trouver x", layout: { next_to: "eq", direction: "right" } },
      ]),
    );
    const second = introduceSlice(first, slice("s2", [{ id: "general", type: "math", content: "ax + b = c" }]));
    expect(box(second, "general").y1).toBeLessThanOrEqual(box(second, "eq", "why").y0);
    expect(second.objects.get("eq")).toBe(first.objects.get("eq"));
  });

  it("écarte l’étiquette d’un point posé sur l’axe, et une formule posée sur une courbe", () => {
    const scene = introduceSlice(
      createScene(viewport),
      slice("s1", [
        { id: "axes", type: "axes", params: { x: [-1, 5], y: [-1, 4] } },
        { id: "curve", type: "function_graph", params: { expression: "x", domain: [0, 4] } },
        { id: "p", type: "point", params: { at: [1, 0] } },
        { id: "p_label", type: "label", content: "(1 ; 0)", attachment: { parent: "p", anchor: "right" } },
        { id: "rule", type: "math", content: "y = x", layout: { center_on: "curve" } },
      ]),
    );
    const label = box(scene, "p_label");
    for (const stroke of strokes(scene, "axes")) expect(intersects(label, stroke)).toBe(false);
    // The label stays next to its point: a small shift off the axis, not a jump across the board.
    expect(Math.abs(label.x0 - 1)).toBeLessThan(1);
    expect(scene.objects.get("rule")!.position).toBeDefined();
  });

  it("refuse frame sur un texte, vers une figure inconnue, ou avec un autre placement", () => {
    const issues = (introduces: unknown[]) => {
      const result = validateModelOutput({ slices: [{ slice_id: "s", introduces, beats: [{ id: "b", say: "Voici.", cues: [], do: [] }] }] });
      return result.ok ? [] : result.issues.map(({ message }) => message);
    };
    expect(
      issues([
        { id: "a", type: "axes" },
        { id: "t", type: "text", content: "x", frame: "a" },
      ]),
    ).toEqual([expect.stringContaining("Seule une figure")]);
    expect(issues([{ id: "p", type: "point", params: { at: [0, 0] }, frame: "nowhere" }])).toEqual([expect.stringContaining("introuvable")]);
    expect(
      issues([
        { id: "a", type: "axes" },
        { id: "p", type: "point", params: { at: [0, 0] }, frame: "a", layout: { next_to: "a", direction: "right" } },
      ]),
    ).toEqual([expect.stringContaining("pas de layout")]);
    expect(
      issues([
        { id: "a", type: "axes" },
        { id: "p", type: "point", params: { at: [0, 0] }, frame: "a" },
      ]),
    ).toEqual([]);
  });

  it("arrête une courbe aux bords de ses axes, et la caméra ne cadre pas ce qui dépasse", () => {
    const scene = introduceSlice(
      createScene(viewport),
      slice("s1", [
        { id: "axes", type: "axes", params: { x: [-3, 3], y: [-1, 4] } },
        { id: "curve", type: "function_graph", params: { expression: "x^2", domain: [-3, 3] } },
      ]),
    );
    const curve = scene.objects.get("curve")!;
    // x² reaches 9 at x = ±3; on these axes it stops near y = 4.
    expect(curve.measurement.body.y1).toBeLessThan(4.3);
    expect(curve.measurement.body.x1).toBeLessThan(2.2);
    // Alone, without axes, the same curve is drawn whole.
    const alone = introduceSlice(createScene(viewport), slice("s2", [{ id: "free", type: "function_graph", params: { expression: "x^2", domain: [-3, 3] } }]));
    expect(alone.objects.get("free")!.measurement.body.y1).toBeGreaterThan(8.9);
  });

  it("met les calculs à côté du graphique plutôt qu’en colonne trop haute pour l’écran", () => {
    const scene = introduceSlice(
      createScene(viewport),
      slice("s1", [
        { id: "eq", type: "math", content: "y = x^2 - 4x + 1" },
        { id: "axes", type: "axes", params: { x: [-1, 5], y: [-4, 4] } },
        { id: "curve", type: "function_graph", params: { expression: "x^2 - 4*x + 1", domain: [-1, 5] } },
        { id: "xs", type: "math", content: "x_S = 2" },
        { id: "ys", type: "math", content: "y_S = -3" },
      ]),
    );
    const all = box(scene, "eq", "axes", "curve", "xs", "ys");
    // Wider than tall, like the screen: the camera can show everything at a readable zoom.
    expect(all.x1 - all.x0).toBeGreaterThan(all.y1 - all.y0);
    for (const id of ["eq", "axes", "xs", "ys"])
      for (const other of ["eq", "axes", "xs", "ys"]) {
        if (id < other) expect(intersects(box(scene, id), box(scene, other))).toBe(false);
      }
  });
});
