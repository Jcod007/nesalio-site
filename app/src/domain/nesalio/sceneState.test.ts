import { describe, expect, it } from "vitest";
import { MathContext, RuntimeState, Slice } from "./contract";
import { intersects } from "./placement";
import { validateModelOutput } from "./validate";
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

describe("textes l'un sur l'autre", () => {
  const boxOf = (scene: ReturnType<typeof createScene>, id: string) => sceneBounds(scene, [id], "layout_bounds")!;

  // Essai du 2026-11-10 (volume molaire) : la conclusion centrée sur une phrase encore au tableau, les deux illisibles.
  it("pose sous un texte qui reste un texte demandé centré sur lui", () => {
    const scene = introduceSlice(createScene(viewport), slice("s", [
      { id: "idee", type: "text", content: "Le volume ne dépend pas du gaz" },
      { id: "resume", type: "text", content: "Vm = 22,4 L/mol", layout: { center_on: "idee" } },
    ]));
    expect(intersects(boxOf(scene, "idee"), boxOf(scene, "resume"))).toBe(false);
    expect(boxOf(scene, "resume").y1).toBeLessThan(boxOf(scene, "idee").y0);
  });

  it("garde la place demandée quand la tranche efface le texte visé, ou quand c'est une figure", () => {
    const erased = introduceSlice(createScene(viewport), Slice.parse({
      slice_id: "s",
      introduces: [
        { id: "idee", type: "text", content: "Le volume ne dépend pas du gaz" },
        { id: "resume", type: "text", content: "Vm = 22,4 L/mol", layout: { center_on: "idee" } },
      ],
      beats: [{ id: "b", say: "Observons la scène.", cues: [], do: [
        { id: "s1", verb: "show", target: "idee", at: "beat:start" },
        { id: "f", verb: "fade_out", target: "idee", at: "after:s1" },
        { id: "s2", verb: "show", target: "resume", at: "after:f" },
      ] }],
    }));
    expect(intersects(boxOf(erased, "idee"), boxOf(erased, "resume"))).toBe(true);
    const figure = introduceSlice(createScene(viewport), slice("s", [
      { id: "rect", type: "polygon", params: { vertices: [[0, 0], [4, 0], [4, 2], [0, 2]] } },
      { id: "nom", type: "text", content: "eau", layout: { center_on: "rect" } },
    ]));
    expect(intersects(boxOf(figure, "rect"), boxOf(figure, "nom"))).toBe(true);
  });

  // Essai du 2026-11-10 (FeS₂) : « 4,40 mol » posé sur les cases d'un tableau.
  it("pose à côté d'un tableau une étiquette demandée « dedans »", () => {
    const scene = introduceSlice(createScene(viewport), slice("s", [
      { id: "tab", type: "matrix", params: { rows: [["4", "11"], ["2", "8"]], column_labels: ["FeS₂", "O₂"], row_labels: ["avant", "après"] } },
      { id: "qte", type: "label", content: "4,40 mol", attachment: { parent: "tab", anchor: "center", placement: "inside" } },
    ]));
    // The table's own area (its bounds also count its labels): the label stands under it.
    const table = scene.objects.get("tab")!;
    expect(boxOf(scene, "qte").y1).toBeLessThanOrEqual(table.position[1] + table.measurement.body.y0);
  });
});

describe("étiquette attachée à une partie de formule", () => {
  // Vraie fenêtre, 2026-11-10 (« réactif limitant ») : « 2 mol » et « 3 mol » sous toute l'équation, empilés avec un trait.
  const eq = { id: "eq", type: "math", content: "N_2 + 3H_2 = 2NH_3", parts: [
    { id: "n2", text: "N_2" }, { id: "plus", text: "+" }, { id: "h2", text: "3H_2" }, { id: "egal", text: "=" }, { id: "nh3", text: "2NH_3" },
  ] };
  const label = (id: string, content: string, part?: string) => ({ id, type: "label", content, attachment: { parent: "eq", anchor: "bottom", ...(part ? { part } : {}) } });
  const middle = (scene: ReturnType<typeof createScene>, id: string) => { const b = sceneBounds(scene, [id], "layout_bounds")!; return (b.x0 + b.x1) / 2; };

  it("pose chaque quantité sous son réactif, sans trait de rappel", () => {
    const scene = introduceSlice(createScene(viewport), slice("s", [eq, label("q1", "2 mol", "n2"), label("q2", "3 mol", "h2")]));
    expect(middle(scene, "q1")).toBeLessThan(middle(scene, "q2"));
    const formula = scene.objects.get("eq")!;
    const n2 = formula.measurement.parts!.n2!;
    expect(Math.abs(middle(scene, "q1") - (formula.position[0] + (n2.x0 + n2.x1) / 2))).toBeLessThan(0.3);
    expect(scene.objects.get("q1")!.leader).toBeUndefined();
    expect(scene.objects.get("q2")!.leader).toBeUndefined();
  });

  it("refuse une partie que la formule n'a pas", () => {
    const result = validateModelOutput({ math_context: { symbols: {}, expressions: {} }, slices: [{
      slice_id: "s", introduces: [eq, label("q1", "2 mol", "o2")],
      beats: [{ id: "b", say: "Voici.", cues: [], do: [{ id: "w", verb: "write", target: "eq", at: "beat:start" }, { id: "s", verb: "show", target: "q1", at: "beat:start" }] }],
    }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.message).toContain("Partie absente « o2 »");
  });
});
