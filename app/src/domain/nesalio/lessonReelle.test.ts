/**
 * Leçon réelle jouée sur la page élève le 2026-11-09 (« zéros de f(x) = −(x − 2)² + 3 »), gardée telle
 * que le modèle l'a écrite. Défauts vus à l'écran : récapitulatif final sur un tableau vide, étiquette
 * d'un zéro poussée au bout de l'axe. Rejouée ici comme le fait le lecteur, après les réparations sans appel.
 */
import { describe, expect, it } from "vitest";
import { playNesalioLesson, type NesalioClip, type NesalioFrame } from "@/engine/nesalioPlayback";
import shell from "./engineShell.json";
import lessonFile from "./fixtures/zeros-recap-vide.json";
import { normalizeSlice } from "./normalize";
import { sceneBounds, visibleArea, type SceneState } from "./sceneState";
import { validateLesson, validateModelOutput, type ValidationState } from "./validate";

const clip: NesalioClip = {
  durationMs: 2_000,
  cues: new Map(),
  async play(draw) {
    draw(2_000);
  },
  dispose() {},
};

/** The tranches as the generator would accept them (normalized one by one), played to the end of the last one. */
async function play(count: number): Promise<SceneState> {
  const { slices: raw, math_context } = lessonFile as { slices: unknown[]; math_context: unknown };
  let state: ValidationState | undefined;
  const slices = raw.slice(0, count).map((slice) => {
    const fixed = normalizeSlice(slice, state).slice;
    const result = validateModelOutput({ ...(state ? {} : { math_context }), slices: [fixed] }, state);
    if (!result.ok) throw new Error(JSON.stringify(result.issues.slice(0, 2)));
    state = result.state;
    return result.value.slices[0];
  });
  const lesson = validateLesson({ ...shell, slices });
  if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues.slice(0, 2)));
  let last: NesalioFrame | undefined;
  await playNesalioLesson(lesson.value, {
    viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 },
    signal: new AbortController().signal,
    wait: async () => {},
    openClip: async () => clip,
    onFrame: (frame) => {
      last = frame;
    },
  });
  return last!.scene;
}

const inside = (scene: SceneState, id: string) => {
  const view = visibleArea(scene),
    box = sceneBounds(scene, [id], "render_bounds")!;
  return box.x0 >= view.x0 - 1e-6 && box.x1 <= view.x1 + 1e-6 && box.y0 >= view.y0 - 1e-6 && box.y1 <= view.y1 + 1e-6;
};

describe("leçon réelle « zéros de f(x) = −(x − 2)² + 3 »", () => {
  it("finit sur un récapitulatif visible : la phrase et la formule à retenir sont montrées et dans le cadre", async () => {
    const scene = await play(4);
    for (const id of ["idea", "resume"]) {
      expect(scene.objects.get(id)?.visible, id).toBe(true);
      expect(inside(scene, id), id).toBe(true);
    }
  });

  it("pose l'étiquette d'un zéro à côté de son point quand un côté est libre", async () => {
    const scene = await play(3);
    const label = sceneBounds(scene, ["lab_z2"], "render_bounds")!,
      point = sceneBounds(scene, ["z2"], "render_bounds")!;
    expect(scene.objects.get("lab_z2")!.leader).toBeUndefined();
    const distance = Math.max(label.x0 - point.x1, point.x0 - label.x1, label.y0 - point.y1, point.y0 - label.y1, 0);
    expect(distance).toBeLessThan(0.5);
  });
});
