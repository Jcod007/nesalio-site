import { describe, expect, it } from "vitest";
import shell from "./engineShell.json";
import { Slice } from "./contract";
import { gapSize } from "./placement";
import { createScene, introduceSlice, sceneBounds, visibleArea } from "./sceneState";
import { validateLesson, validateModelOutput } from "./validate";
import { playNesalioLesson, type NesalioClip, type NesalioFrame } from "@/engine/nesalioPlayback";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const beat = (id: string, todo: unknown[]) => ({ id, say: "On range le tableau.", cues: [], do: todo });
const clip = (playheads: number[]): NesalioClip => ({
  durationMs: 2_000, cues: new Map(), async play(draw) { for (const playhead of playheads) draw(playhead); }, dispose() {},
});

async function play(slices: unknown[], beatId: string, playheads: number[]): Promise<NesalioFrame[]> {
  const lesson = validateLesson({ ...shell, slices });
  if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
  const frames: NesalioFrame[] = [];
  await playNesalioLesson(lesson.value, {
    viewport, signal: new AbortController().signal, wait: async () => {},
    openClip: async (b) => b.id === beatId ? clip(playheads) : clip([2_000]),
    onFrame: (frame, b) => { if (b.id === beatId) frames.push(frame); },
  });
  return frames;
}

describe("move, to_edge, to_corner", () => {
  it("place un objet dans un coin de ce que voit l’élève, puis il garde sa place", () => {
    const scene = introduceSlice(createScene(viewport), Slice.parse({
      slice_id: "s", introduces: [{ id: "t", type: "text", content: "Titre", layout: { to_corner: "top_left" } }], beats: [beat("b", [])],
    }));
    const box = sceneBounds(scene, ["t"], "layout_bounds")!;
    const view = visibleArea(scene);
    expect(box.x0).toBeCloseTo(view.x0 + gapSize("md"), 6);
    expect(box.y1).toBeCloseTo(view.y1 - gapSize("md"), 6);
  });

  it("déplace une formule vers un coin en douceur, avec son étiquette", async () => {
    const frames = await play([{
      slice_id: "s",
      introduces: [
        { id: "key", type: "math", content: "x_S = -\\frac{b}{2a}" },
        { id: "key_label", type: "label", content: "à retenir", attachment: { parent: "key", anchor: "bottom" } },
      ],
      beats: [
        beat("b0", [{ id: "w", verb: "write", target: "key", at: "beat:start" }, { id: "s", verb: "show", target: "key_label", at: "beat:start" }]),
        beat("b1", [{ id: "m", verb: "move", target: "key", to: { to_corner: "top_right" }, at: "beat:start" }]),
      ],
    }], "b1", [350, 2_000]);
    const [middle, end] = frames as [NesalioFrame, NesalioFrame];
    const start = frames.length && middle.scene.objects.get("key")!;
    const box = sceneBounds(end.scene, ["key", "key_label"], "layout_bounds")!;
    const view = visibleArea(end.scene);
    expect(box.x1).toBeCloseTo(view.x1 - gapSize("md"), 6);
    expect(box.y1).toBeCloseTo(view.y1 - gapSize("md"), 6);
    // The label keeps its place under the formula.
    const offset = (frame: NesalioFrame) => {
      const key = frame.scene.objects.get("key")!.position, label = frame.scene.objects.get("key_label")!.position;
      return [label[0] - key[0], label[1] - key[1]];
    };
    expect(offset(end)).toEqual(offset(middle));
    // Half-way in time is half-way in space (smoothstep at 0.5).
    const final = end.scene.objects.get("key")!.position;
    expect(start && start.position[0]).toBeLessThan(final[0]);
  });

  it("emporte les courbes et les points avec leurs axes, et le repère suit", async () => {
    const frames = await play([{
      slice_id: "s",
      introduces: [
        { id: "axes", type: "axes", params: { x: [-2, 2], y: [-2, 2] } },
        { id: "curve", type: "function_graph", params: { expression: "x", domain: [-2, 2] } },
        { id: "p", type: "point", params: { at: [1, 1] } },
        { id: "eq", type: "math", content: "y = x", layout: { next_to: "axes", direction: "right" } },
      ],
      beats: [
        beat("b0", [{ id: "a", verb: "show", target: "axes", at: "beat:start" }, { id: "c", verb: "draw", target: "curve", at: "beat:start" },
          { id: "pp", verb: "show", target: "p", at: "beat:start" }, { id: "e", verb: "write", target: "eq", at: "beat:start" }]),
        beat("b1", [{ id: "m", verb: "move", target: "axes", to: { to_edge: "left" }, at: "beat:start" }]),
      ],
    }], "b1", [2_000]);
    const { scene } = frames[0]!;
    const [ax, ay] = scene.objects.get("axes")!.position;
    expect(scene.objects.get("curve")!.position).toEqual([ax, ay]);
    expect(scene.objects.get("p")!.position).toEqual([ax, ay]);
    expect(scene.frames.get(scene.objects.get("axes")!.frame!)).toEqual([ax, ay]);
    // The whole figure (axes, curve, point) is what lines up with the edge.
    expect(sceneBounds(scene, ["axes", "curve", "p"], "layout_bounds")!.x0).toBeCloseTo(visibleArea(scene).x0 + gapSize("md"), 6);
  });

  it("refuse un déplacement par rapport à soi-même ou à un objet inconnu", () => {
    const slice = (to: unknown) => ({
      slice_id: "s", introduces: [{ id: "a", type: "text", content: "A" }],
      beats: [beat("b", [{ id: "m", verb: "move", target: "a", to, at: "beat:start" }])],
    });
    expect(validateModelOutput({ slices: [slice({ next_to: "a", direction: "right" })] }))
      .toMatchObject({ ok: false, issues: [{ message: expect.stringContaining("lui-même") }] });
    expect(validateModelOutput({ slices: [slice({ next_to: "nowhere", direction: "right" })] }).ok).toBe(false);
    expect(validateModelOutput({ slices: [slice({ to_edge: "left" })] }).ok).toBe(true);
  });
});

describe("la place libérée devant l’élève sert à la suite", () => {
  it("installe la tranche suivante au milieu de l’écran quand la leçon vient de le dégager", async () => {
    const frames = await play([
      {
        slice_id: "s1",
        introduces: [
          { id: "f", type: "math", content: "x = -\\frac{b}{2a}" },
          { id: "eq", type: "math", content: "y = x^2 - 4x + 1" },
        ],
        beats: [
          beat("a0", [{ id: "w1", verb: "write", target: "f", at: "beat:start" }, { id: "w2", verb: "write", target: "eq", at: "beat:start" }]),
          beat("a1", [{ id: "m", verb: "move", target: "f", to: { to_corner: "top_left" }, at: "beat:start" },
            { id: "o", verb: "fade_out", target: "eq", at: "beat:start" }]),
        ],
      },
      {
        slice_id: "s2",
        introduces: [{ id: "axes", type: "axes", params: { x: [-1, 5], y: [-3, 3] } }],
        beats: [beat("b0", [{ id: "s", verb: "show", target: "axes", at: "beat:start" }])],
      },
    ], "b0", [2_000]);
    const { scene } = frames[0]!;
    const screen = visibleArea(scene);
    const axes = sceneBounds(scene, ["axes"], "layout_bounds")!;
    const corner = sceneBounds(scene, ["f"], "layout_bounds")!;
    // The graph is drawn in front of the student, with the formula kept in its corner still on screen.
    expect(axes.x0).toBeGreaterThanOrEqual(screen.x0);
    expect(axes.x1).toBeLessThanOrEqual(screen.x1);
    expect(corner.x0).toBeGreaterThanOrEqual(screen.x0 - 1e-6);
    expect(corner.y1).toBeLessThanOrEqual(screen.y1 + 1e-6);
  });

  it("garde dans le cadre la formule rangée dans un coin quand la caméra part vers la suite", async () => {
    const frames = await play([
      {
        slice_id: "s1",
        introduces: [
          { id: "f", type: "math", content: "x = 2" },
          { id: "eq", type: "math", content: "y = x^2 - 4x + 1" },
        ],
        beats: [
          beat("a0", [{ id: "w1", verb: "write", target: "f", at: "beat:start" }, { id: "w2", verb: "write", target: "eq", at: "beat:start" }]),
          // The centre stays taken by eq: the graph will be placed away from the current view.
          beat("a1", [{ id: "m", verb: "move", target: "f", to: { to_corner: "top_left" }, at: "beat:start" }]),
        ],
      },
      {
        slice_id: "s2",
        introduces: [{ id: "axes", type: "axes", params: { x: [-2, 2], y: [-1, 1] } }],
        beats: [beat("b0", [{ id: "c", verb: "camera.focus", targets: ["axes"], bounds: "layout_bounds", at: "beat:start" },
          { id: "s", verb: "show", target: "axes", at: "beat:start" }])],
      },
    ], "b0", [2_000]);
    const { scene } = frames.at(-1)!;
    const screen = visibleArea(scene);
    const inView = (id: string) => {
      const box = sceneBounds(scene, [id], "layout_bounds")!;
      return box.x0 >= screen.x0 - 1e-6 && box.x1 <= screen.x1 + 1e-6 && box.y0 >= screen.y0 - 1e-6 && box.y1 <= screen.y1 + 1e-6;
    };
    expect(inView("axes")).toBe(true);
    expect(inView("f")).toBe(true);
  });
});
