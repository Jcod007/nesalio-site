import { describe, expect, it } from "vitest";
import shell from "./engineShell.json";
import { measureSceneObject } from "./measurement";
import { sceneBounds, visibleArea } from "./sceneState";
import { validateLesson } from "./validate";
import { SceneObject } from "./contract";
import { playNesalioLesson, type NesalioClip, type NesalioFrame } from "@/engine/nesalioPlayback";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const math = { symbols: { a: { kind: "parameter" as const, initial: 0.2, min: 0.2, max: 3 } }, expressions: {} };

describe("tranche sans nouveaux objets", () => {
  it("accepte une tranche qui omet introduces (vue en vraie génération)", async () => {
    const { validateModelOutput } = await import("./validate");
    const first = validateModelOutput({
      math_context: math,
      slices: [
        {
          slice_id: "s1",
          introduces: [{ id: "f", type: "function_graph", params: { expression: "a*x", domain: [-2, 2] } }],
          beats: [{ id: "b1", say: "Une droite.", cues: [], do: [{ id: "d", verb: "draw", target: "f", at: "beat:start" }] }],
        },
      ],
    });
    if (!first.ok) throw new Error(JSON.stringify(first.issues));
    const next = validateModelOutput(
      {
        slices: [
          {
            slice_id: "s2",
            beats: [
              {
                id: "b2",
                say: "Elle se redresse.",
                cues: [],
                do: [{ id: "p", verb: "animate_parameter", parameter: "a", from: 0.2, to: 3, at: "beat:start" }],
              },
            ],
          },
        ],
      },
      first.state,
    );
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.value.slices[0]!.introduces).toEqual([]);
  });
});

describe("objets animés : la caméra cadre toute la plage du paramètre (spéc. §12)", () => {
  it("réserve la zone qu'une courbe couvrira sur toute la plage de son paramètre", () => {
    const curve = SceneObject.parse({ id: "f", type: "function_graph", params: { expression: "a*x", domain: [-2, 2] } });
    const measured = measureSceneObject(curve, new Map([["a", 0.2]]), math);
    // Today the curve is almost flat; at a = 3 it reaches ±6.
    expect(measured.body.y1).toBeLessThan(0.5);
    expect(measured.reserve!.y1).toBeGreaterThan(5.9);
    expect(measured.reserve!.y0).toBeLessThan(-5.9);
    // A curve without a parameter reserves nothing more than itself.
    const plain = measureSceneObject(SceneObject.parse({ id: "g", type: "function_graph", params: { expression: "2*x", domain: [-2, 2] } }), new Map(), math);
    expect(plain.reserve).toBeUndefined();
  });

  it("recadre avant l'animation pour que la courbe reste entière jusqu'au bout", async () => {
    const lesson = validateLesson({
      ...shell,
      scene: { ...shell.scene, math_context: math },
      slices: [
        {
          slice_id: "s",
          introduces: [{ id: "f", type: "function_graph", params: { expression: "a*x", domain: [-2, 2] } }],
          beats: [
            {
              id: "b0",
              say: "Une droite presque plate.",
              cues: [],
              do: [
                { id: "d", verb: "draw", target: "f", at: "beat:start" },
                // Tight framing on today's flat line: the steep line at a = 3 would leave the frame.
                { id: "c", verb: "camera.focus", targets: ["f"], bounds: "render_bounds", at: "beat:start" },
              ],
            },
            { id: "b1", say: "Elle se redresse.", cues: [], do: [{ id: "p", verb: "animate_parameter", parameter: "a", from: 0.2, to: 3, at: "beat:start" }] },
          ],
        },
      ],
    });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const frames: NesalioFrame[] = [];
    const clip = (playheads: number[]): NesalioClip => ({
      durationMs: 2_000,
      cues: new Map(),
      async play(draw) {
        for (const playhead of playheads) draw(playhead);
      },
      dispose() {},
    });
    await playNesalioLesson(lesson.value, {
      viewport,
      signal: new AbortController().signal,
      wait: async () => {},
      openClip: async (beat) => (beat.id === "b0" ? clip([2_000]) : clip([2_000])),
      onFrame: (frame, beat) => {
        if (beat.id === "b1") frames.push(frame);
      },
    });
    const { scene } = frames.at(-1)!;
    const view = visibleArea(scene);
    const curve = sceneBounds(scene, ["f"], "render_bounds")!;
    expect(scene.parameters.get("a")).toBe(3);
    expect(curve.y1).toBeLessThanOrEqual(view.y1 + 1e-6);
    expect(curve.y0).toBeGreaterThanOrEqual(view.y0 - 1e-6);
  });
});
