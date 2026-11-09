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
      slice_id: "s", introduces: [{ id: "t", type: "text", content: "Une phrase assez longue pour remplir l'écran en largeur" }],
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
});
