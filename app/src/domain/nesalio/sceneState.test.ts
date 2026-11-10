import { describe, expect, it } from "vitest";
import { MathContext, RuntimeState, Slice } from "./contract";
import { intersects } from "./placement";
import {
  beginBeat, CAMERA_ZOOM, createScene, fitSceneCamera, introduceSlice, runtimeState, sceneBounds,
  setParameter, setVisibility, withCameraState, withMathContext, type MeasureObject,
} from "./sceneState";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };

function slice(id: string, introduces: unknown[], groups?: unknown[]) {
  return Slice.parse({ slice_id: id, introduces, groups, beats: [{ id: "beat", say: "Observons la scène.", cues: [], do: [] }] });
}

describe("état et placement Nesalio", () => {
  it("réserve un label masqué pour next_to sans l'inclure dans le cadrage visible", () => {
    const prepared = introduceSlice(createScene(viewport), slice("s1", [
      { id: "point", type: "point", params: { at: [0, 0] } },
      { id: "annotation", type: "label", content: "Point de référence", attachment: { parent: "point", anchor: "right" } },
      { id: "equation", type: "math", content: "f(x)=0", layout: { next_to: "point", direction: "right", gap: "sm" } },
    ]));
    const reserve = sceneBounds(prepared, ["point"], "layout_bounds")!;
    const equation = sceneBounds(prepared, ["equation"], "layout_bounds")!;
    expect(equation.x0).toBeCloseTo(reserve.x1 + 0.25);
    expect(sceneBounds(prepared, ["point"], "render_bounds")).toBeNull();
    const pointShown = setVisibility(prepared, "point", true);
    expect(sceneBounds(pointShown, ["point"], "render_bounds")!.x1).toBeLessThan(reserve.x1);
    const labelShown = setVisibility(pointShown, "annotation", true);
    expect(sceneBounds(labelShown, ["point"], "render_bounds")).toEqual(reserve);
    expect(labelShown.objects.get("equation")!.position).toEqual(prepared.objects.get("equation")!.position);
  });

  it("place une annotation tardive autour d'un obstacle en conservant les objets précédents", () => {
    const previous = introduceSlice(createScene(viewport), slice("s1", [
      { id: "base", type: "point", params: { at: [0, 0] } },
      { id: "obstacle", type: "text", content: "Déjà là", layout: { next_to: "base", direction: "right" } },
    ]));
    const added = introduceSlice(previous, slice("s2", [
      { id: "late", type: "callout", content: "Annotation", attachment: { parent: "base", anchor: "right" } },
    ]));
    expect(added.objects.get("base")).toBe(previous.objects.get("base"));
    expect(added.objects.get("obstacle")).toBe(previous.objects.get("obstacle"));
    expect(added.objects.get("late")!.position[1]).not.toBe(0);
    // Since 2026-11-09 the label of a small mark first takes a free corner next to it, without a leader line.
    expect(added.objects.get("late")!.leader).toBeUndefined();
    const late = sceneBounds(added, ["late"], "layout_bounds")!;
    expect(Math.max(late.x0, 0.08 - late.x1, late.y0 - 0.08, -0.08 - late.y1)).toBeLessThan(0.5);
    expect(intersects(sceneBounds(added, ["late"], "layout_bounds")!, sceneBounds(added, ["obstacle"], "layout_bounds")!)).toBe(false);
    expect(previous.objects.has("late")).toBe(false);
  });

  it("aligne une colonne de formules et mesure son groupe avant de placer un objet voisin", () => {
    const scene = introduceSlice(createScene(viewport), slice("algebra", [
      { id: "graph", type: "function_graph", params: { expression: "x^2", domain: [-1, 1] } },
      { id: "first", type: "math", content: "y=x^2" },
      { id: "second", type: "math", content: "x=2" },
      { id: "conclusion", type: "text", content: "Conclusion", layout: { next_to: "steps", direction: "right" } },
      { id: "groupLabel", type: "label", content: "Calcul", attachment: { parent: "steps", anchor: "top" } },
    ], [
      { id: "steps", items: ["first", "second"], arrange: { direction: "down", align: "left" }, layout: { next_to: "graph", direction: "right" } },
    ]));
    const first = sceneBounds(scene, ["first"], "layout_bounds")!;
    const second = sceneBounds(scene, ["second"], "layout_bounds")!;
    const steps = sceneBounds(scene, ["steps"], "layout_bounds")!;
    expect(first.x0).toBeCloseTo(second.x0);
    expect(first.y0 - second.y1).toBeCloseTo(0.25);
    expect(sceneBounds(scene, ["conclusion"], "layout_bounds")!.x0).toBeCloseTo(steps.x1 + 0.25);
    expect(sceneBounds(scene, ["groupLabel"], "layout_bounds")!.y0).toBeGreaterThan(first.y1);
    const revealed = setVisibility(scene, "steps", true);
    expect(runtimeState(revealed).visible_objects).toEqual(["first", "second"]);
  });

  it("ne dézoome jamais au point de rendre le texte illisible : la priorité est cadrée, le reste signalé", () => {
    const prepared = introduceSlice(createScene(viewport), slice("markers", [
      { id: "west", type: "point", params: { at: [-30, 1] } },
      { id: "east", type: "point", params: { at: [42, -1] } },
    ]));
    expect(fitSceneCamera(prepared, ["west", "east"])).toBeNull();
    expect(fitSceneCamera(prepared, ["west", "east"], "layout_bounds")!.state.zoom).toBe(CAMERA_ZOOM.min);
    const visible = setVisibility(setVisibility(beginBeat(prepared, "markers", "beat"), "west", true), "east", true);
    const frame = fitSceneCamera(visible, ["west", "east"], "render_bounds", { priority: ["east"] })!;
    expect(frame.state.x).toBeCloseTo(42);
    expect(frame.state.zoom).toBe(CAMERA_ZOOM.max);
    expect(frame.hidden).toEqual(["west"]);
    expect(runtimeState(visible).camera.state.zoom).toBe(1);
    const actual = runtimeState(withCameraState(visible, { state: frame.state, is_animating: true, target_state: frame.state }));
    expect(RuntimeState.parse(actual)).toMatchObject({
      current_slice: "markers", current_beat: "beat", visible_objects: ["west", "east"], camera: { state: frame.state, target_state: frame.state },
    });
  });

  it("cadre tout ce qui tient à une taille lisible, sans grossir à l’excès", () => {
    const scene = setVisibility(introduceSlice(createScene(viewport), slice("near", [
      { id: "a", type: "point", params: { at: [0, 0] } },
      { id: "b", type: "point", params: { at: [4, 0] } },
    ])), "a", true);
    const both = fitSceneCamera(setVisibility(scene, "b", true), ["a", "b"])!;
    expect(both.state.x).toBeCloseTo(2);
    expect(both.state.zoom).toBe(CAMERA_ZOOM.max);
    expect(both.hidden).toEqual([]);
    const far = introduceSlice(createScene(viewport), slice("mid", [
      { id: "l", type: "point", params: { at: [-10, 0] } },
      { id: "r", type: "point", params: { at: [10, 0] } },
    ]));
    const fitted = fitSceneCamera(far, ["l", "r"], "layout_bounds")!;
    expect(fitted.state.zoom).toBeGreaterThan(CAMERA_ZOOM.min);
    expect(fitted.state.zoom).toBeLessThan(1);
    expect(fitted.hidden).toEqual([]);
  });

  it("recalcule les bornes d'une courbe et la position de son label quand un paramètre change", () => {
    const math = MathContext.parse({ symbols: { slope: { kind: "parameter", initial: 1, min: 1, max: 4 } }, expressions: {} });
    const before = introduceSlice(withMathContext(createScene(viewport), math), slice("rate", [
      { id: "curve", type: "function_graph", params: { expression: "slope*x", domain: [-1, 1] } },
      { id: "label", type: "label", content: "Pente", attachment: { parent: "curve", anchor: "top" } },
    ]));
    const next = setParameter(before, "slope", 3);
    expect(next.objects.get("curve")!.position).toEqual(before.objects.get("curve")!.position);
    expect(next.objects.get("label")!.position[1] - before.objects.get("label")!.position[1]).toBeCloseTo(2);
    expect(runtimeState(next).parameters).toEqual({ slope: 3 });
    expect(runtimeState(before).parameters).toEqual({ slope: 1 });
    expect(() => setParameter(next, "slope", 5)).toThrow("intervalle");
  });

  it("refuse une croissance qui entre en collision et conserve l'état précédent", () => {
    const math = MathContext.parse({ symbols: { width: { kind: "parameter", initial: 1, min: 1, max: 4 } }, expressions: {} });
    const measure: MeasureObject = (object, values) => ({
      body: { x0: 0, y0: 0, x1: object.id === "dynamic" ? values.get("width")! : 1, y1: 1 },
    });
    const before = introduceSlice(withMathContext(createScene(viewport), math), slice("collision", [
      { id: "dynamic", type: "text", content: "Largeur" },
      { id: "fixed", type: "text", content: "Fixe", layout: { next_to: "dynamic", direction: "right" } },
    ]), measure);
    expect(() => setParameter(before, "width", 4, measure)).toThrow("Conflit dynamique");
    expect(runtimeState(before).parameters).toEqual({ width: 1 });
  });
});

describe("repère trop grand pour le tableau", () => {
  // Audit caméra 2026-11-09 : y de 0 à 16 faisait un graphique de deux écrans, coupé ou lu trop petit.
  it("réduit le repère et tout ce qui est dessiné dessus à la même échelle", () => {
    const scene = introduceSlice(createScene(viewport), slice("grand", [
      { id: "plan", type: "axes", params: { x: [0, 6], y: [0, 16] } },
      { id: "droite", type: "function_graph", params: { expression: "2*x + 3", domain: [0, 6] } },
      { id: "p", type: "point", params: { at: [5, 13] } },
    ]));
    const axes = sceneBounds(scene, ["plan"], "layout_bounds")!;
    expect(axes.y1 - axes.y0).toBeLessThanOrEqual(9);
    expect(scene.objects.get("p")!.scale).toEqual({ x: 0.5, y: 0.5 });
    // The point stays on the line: (5, 13) is on y = 2x + 3 at the same scale.
    const line = sceneBounds(scene, ["droite"], "layout_bounds")!;
    const point = sceneBounds(scene, ["p"], "layout_bounds")!;
    expect((point.y0 + point.y1) / 2).toBeCloseTo(line.y1 - 0.03 - (15 - 13) * 0.5, 1);
  });

  it("garde l'échelle naturelle d'un repère qui tient à l'écran", () => {
    const scene = introduceSlice(createScene(viewport), slice("normal", [{ id: "plan", type: "axes", params: { x: [-6, 6], y: [-4, 4] } }]));
    expect(scene.objects.get("plan")!.scale).toBeUndefined();
  });
});
