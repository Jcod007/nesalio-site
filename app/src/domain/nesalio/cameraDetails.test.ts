import { describe, expect, it } from "vitest";
import shell from "./engineShell.json";
import { sceneBounds, visibleArea, type SceneState } from "./sceneState";
import { validateLesson } from "./validate";
import { playNesalioLesson, type NesalioClip, type NesalioFrame } from "@/engine/nesalioPlayback";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const clip = (playheads: number[]): NesalioClip => ({
  durationMs: 2_000, cues: new Map(), async play(draw) { for (const playhead of playheads) draw(playhead); }, dispose() {},
});

async function finalScene(slices: unknown[], policy: Record<string, unknown> = {}): Promise<SceneState> {
  const lesson = validateLesson({ ...shell, scene: { ...shell.scene, camera_policy: { ...shell.scene.camera_policy, ...policy } }, slices });
  if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
  let last: NesalioFrame | undefined;
  await playNesalioLesson(lesson.value, {
    viewport, signal: new AbortController().signal, wait: async () => {},
    openClip: async () => clip([2_000]), onFrame: (frame) => { last = frame; },
  });
  return last!.scene;
}

const contained = (scene: SceneState, ids: string[]) => {
  const view = visibleArea(scene);
  const box = sceneBounds(scene, ids, "render_bounds")!;
  return box.x0 >= view.x0 - 1e-6 && box.x1 <= view.x1 + 1e-6 && box.y0 >= view.y0 - 1e-6 && box.y1 <= view.y1 + 1e-6;
};

describe("détails du cadrage", () => {
  it("prend la marge réglée dans la leçon (camera_policy.focus_padding)", async () => {
    const slices = [{
      slice_id: "s", // A long formula (prose is cut into lines since 2026-11-10, see boardLines): it fills the screen in width.
      introduces: [{ id: "t", type: "math", content: "a + b + c + d + e + f + g + h + i + j + k + l + m + n + o + p + q + r" }],
      beats: [{ id: "b", say: "Voici.", cues: [], do: [
        { id: "w", verb: "write", target: "t", at: "beat:start" },
        { id: "c", verb: "camera.focus", targets: ["t"], transition: "instant", at: "beat:start" },
      ] }],
    }];
    const tight = await finalScene(slices, { focus_padding: "xs" });
    const loose = await finalScene(slices, { focus_padding: "xl" });
    // More margin: the camera stands further back from the same text.
    expect(loose.camera.state.zoom).toBeLessThan(tight.camera.state.zoom);
  });

  it("cadre une figure avec les étiquettes de ses points, pas seulement la figure", async () => {
    const scene = await finalScene([{
      slice_id: "s",
      introduces: [
        { id: "axes", type: "axes", params: { x: [-1, 4], y: [-1, 3] } },
        { id: "curve", type: "function_graph", params: { expression: "x/2", domain: [0, 4] } },
        { id: "p", type: "point", params: { at: [4, 2] } },
        { id: "p_label", type: "label", content: "le point d'arrivée de la courbe", attachment: { parent: "p", anchor: "right" } },
      ],
      beats: [{ id: "b", say: "Voici.", cues: [], do: [
        { id: "a", verb: "show", target: "axes", at: "beat:start" },
        { id: "d", verb: "draw", target: "curve", at: "beat:start" },
        { id: "s1", verb: "show", target: "p", at: "beat:start" },
        { id: "s2", verb: "show", target: "p_label", at: "beat:start" },
        // The model names the curve only: its point's label must not be cut at the edge.
        { id: "c", verb: "camera.focus", targets: ["curve"], transition: "instant", at: "after:s2" },
      ] }],
    }]);
    expect(contained(scene, ["p_label"])).toBe(true);
  });

  /** Seen in real generations: framing a new formula cut a figure still on the board in half. */
  const cutting = (focus: boolean) => [{
    slice_id: "s",
    introduces: [
      { id: "tri", type: "polygon", params: { vertices: [[-9, -1], [-3, -1], [-9, 4]] } },
      { id: "f", type: "math", content: "c = \\sqrt{a^2 + b^2}", layout: { next_to: "tri", direction: "right", gap: "xl" } },
      { id: "g", type: "math", content: "c = 5", layout: { next_to: "f", direction: "right", gap: "xl" } },
    ],
    beats: [
      { id: "b1", say: "Voici le triangle.", cues: [], do: [{ id: "d", verb: "draw", target: "tri", at: "beat:start" }] },
      { id: "b2", say: "Et voici la formule.", cues: [], do: [
        { id: "w", verb: "write", target: "f", at: "beat:start" },
        { id: "w2", verb: "write", target: "g", at: "after:w" },
        ...focus ? [{ id: "c", verb: "camera.focus", targets: ["f", "g"], transition: "instant", at: "after:w2" }] : [],
      ] },
    ],
  }];

  it("ne coupe pas en deux une figure encore au tableau quand elle tient avec ce qu’on cadre", async () => {
    for (const focus of [true, false]) {
      const scene = await finalScene(cutting(focus));
      expect(contained(scene, ["f", "g"]), `focus=${focus}`).toBe(true);
      expect(contained(scene, ["tri"]), `focus=${focus}`).toBe(true);
    }
  });

  it("garde le zoom sur un détail : la courbe qui porte le point visé reste coupée", async () => {
    const scene = await finalScene([{
      slice_id: "s",
      introduces: [
        { id: "axes", type: "axes", params: { x: [-6, 6], y: [-1, 12] } },
        { id: "curve", type: "function_graph", params: { expression: "x^2/3", domain: [-6, 6] } },
        { id: "v", type: "point", params: { at: [0, 0] } },
      ],
      beats: [{ id: "b", say: "Voici.", cues: [], do: [
        { id: "a", verb: "show", target: "axes", at: "beat:start" },
        { id: "d", verb: "draw", target: "curve", at: "beat:start" },
        { id: "s1", verb: "show", target: "v", at: "beat:start" },
        { id: "c", verb: "camera.focus", targets: ["v"], transition: "instant", at: "after:s1" },
      ] }],
    }]);
    expect(contained(scene, ["curve"])).toBe(false);
    expect(scene.camera.state.zoom).toBeGreaterThan(1);
  });
});
