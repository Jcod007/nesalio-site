import { describe, expect, it } from "vitest";
import shell from "./engineShell.json";
import { Slice } from "./contract";
import { clearTarget, createScene, introduceSlice, sceneBounds, setDimmed, setVisibility } from "./sceneState";
import { validateLesson, validateModelOutput } from "./validate";
import { DIM_OPACITY, clearWithFirstReveal, playNesalioLesson, type NesalioClip, type NesalioFrame } from "@/engine/nesalioPlayback";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const beat = (id: string, say: string, cues: unknown[], todo: unknown[]) => ({ id, say, cues, do: todo });

describe("dégager le tableau : dim, fade_out, remove", () => {
  const graph = {
    slice_id: "s1",
    introduces: [
      { id: "axes", type: "axes", params: { x: [-1, 4], y: [-1, 4] } },
      { id: "p", type: "point", params: { at: [1, 1] } },
      { id: "p_label", type: "label", content: "(1 ; 1)", attachment: { parent: "p", anchor: "right" } },
      { id: "eq", type: "math", content: "y = x" },
      { id: "note", type: "text", content: "Une note" },
    ],
    groups: [{ id: "texts", items: ["eq", "note"] }],
    beats: [
      beat("b1", "Voici le point.", [{ id: "point", text: "point" }], [
        { id: "s_axes", verb: "show", target: "axes", at: "beat:start" },
        { id: "s_p", verb: "show", target: "p", at: "cue:point" },
        { id: "s_l", verb: "show", target: "p_label", at: "cue:point" },
      ]),
      beat("b2", "On passe à autre chose.", [{ id: "autre", text: "autre" }], [
        { id: "r_p", verb: "remove", target: "p", at: "cue:autre" },
        { id: "r_texts", verb: "remove", target: "texts", at: "cue:autre" },
      ]),
    ],
  };

  it("refuse d’utiliser un objet effacé dans un passage suivant, avec ses étiquettes et les membres de son groupe", () => {
    const later = (target: string) => validateModelOutput({ slices: [{ ...graph, beats: [...graph.beats,
      beat("b3", "Encore.", [], [{ id: "again", verb: "show", target, at: "beat:start" }])] }] });
    for (const target of ["p", "p_label", "eq", "note", "texts"]) {
      expect(later(target)).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining("effacé") }] });
    }
    expect(later("axes").ok).toBe(true);
  });

  it("garde la trace des objets effacés d’une tranche à l’autre, y compris comme référence de placement", () => {
    const first = validateModelOutput({ slices: [graph] });
    if (!first.ok) throw new Error(JSON.stringify(first.issues));
    const next = validateModelOutput({ slices: [{
      slice_id: "s2",
      introduces: [{ id: "c", type: "text", content: "Commentaire", layout: { next_to: "eq", direction: "right" } }],
      beats: [beat("c1", "Bien.", [], [])],
    }] }, first.state);
    expect(next).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining("effacé") }] });
  });

  it("estompe sans cacher, et show ramène au premier plan", () => {
    let scene = introduceSlice(createScene(viewport), Slice.parse(graph));
    scene = setVisibility(setVisibility(scene, "p", true), "p_label", true);
    scene = setDimmed(scene, "p", true);
    expect(scene.objects.get("p")).toMatchObject({ visible: true, dimmed: true });
    // The label steps back with its point.
    expect(scene.objects.get("p_label")).toMatchObject({ visible: true, dimmed: true });
    scene = setVisibility(scene, "p", true);
    expect(scene.objects.get("p")!.dimmed).toBeUndefined();
  });

  it("fade_out et remove libèrent la place ; seul remove interdit de réutiliser l’objet", () => {
    const words = (id: string) => Slice.parse({ slice_id: id, introduces: [{ id: `${id}_t`, type: "text", content: "Une étape de calcul" }],
      beats: [beat(`${id}_b`, "Ensuite.", [], [])] });
    const base = introduceSlice(createScene(viewport), words("a"));
    const place = base.objects.get("a_t")!.position;

    const faded = introduceSlice(clearTarget(base, "a_t", false), words("b"));
    expect(faded.objects.get("b_t")!.position).toEqual(place);
    // Still known to the board: show can bring it back.
    expect(faded.objects.get("a_t")).toMatchObject({ visible: false, faded: true });
    expect(faded.objects.get("a_t")!.removed).toBeUndefined();

    const removed = introduceSlice(clearTarget(base, "a_t", true), words("b"));
    // Same place: the camera has nowhere to travel.
    expect(removed.objects.get("b_t")!.position).toEqual(place);
    expect(sceneBounds(removed, ["a_t"], "layout_bounds")).toBeNull();
  });

  it("anime l’opacité pendant dim et remove, puis retire l’objet à la fin du fondu", async () => {
    const lesson = validateLesson({ ...shell, slices: [{
      slice_id: "s",
      introduces: [{ id: "a", type: "point", params: { at: [0, 0] } }, { id: "b", type: "point", params: { at: [2, 0] } }],
      beats: [
        beat("one", "Deux points.", [], [{ id: "sa", verb: "show", target: "a", at: "beat:start" }, { id: "sb", verb: "show", target: "b", at: "beat:start" }]),
        beat("two", "On estompe le premier, on efface le second.", [{ id: "est", text: "estompe" }, { id: "eff", text: "efface" }], [
          { id: "da", verb: "dim", target: "a", at: "cue:est" }, { id: "rb", verb: "remove", target: "b", at: "cue:eff" },
        ]),
      ],
    }] });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const frames: NesalioFrame[] = [];
    const clip = (cues: Record<string, [number, number]>, playheads: number[]): NesalioClip => ({
      durationMs: 3_000, cues: new Map(Object.entries(cues).map(([id, [start, end]]) => [id, { start, end }])),
      async play(draw) { for (const playhead of playheads) draw(playhead); }, dispose() {},
    });
    await playNesalioLesson(lesson.value, {
      viewport, signal: new AbortController().signal, wait: async () => {},
      openClip: async (b) => b.id === "one" ? clip({}, [0]) : clip({ est: [100, 300], eff: [1_000, 1_200] }, [325, 1_225, 2_000]),
      onFrame: (frame, b) => { if (b.id === "two") frames.push(frame); },
    });
    const [middle, fading, end] = frames as [NesalioFrame, NesalioFrame, NesalioFrame];
    expect(middle.opacity.get("a")).toBeCloseTo(1 - (1 - DIM_OPACITY) * 0.5, 5);
    expect(fading.opacity.has("a")).toBe(false);
    expect(fading.scene.objects.get("a")).toMatchObject({ visible: true, dimmed: true });
    expect(fading.opacity.get("b")).toBeCloseTo(0.5, 5);
    expect(fading.scene.objects.get("b")!.visible).toBe(true);
    expect(end.scene.objects.get("b")).toMatchObject({ visible: false, removed: true });
  });
});

describe("effacement au début d'un passage", () => {
  const say = "Retenons l'essentiel : la formule n égale m sur M.";
  const cues = new Map([["c_formule", { start: 1_200, end: 1_600 }]]);
  const passage = (todo: unknown[]) => beat("b", say, [{ id: "c_formule", text: "formule" }], todo) as never;

  it("attend le premier nouvel objet du passage (audit caméra : écran vide pendant que Nesa parle)", () => {
    const timed = clearWithFirstReveal(passage([
      { id: "f_tab", verb: "fade_out", at: "beat:start", target: "tab" },
      { id: "r_old", verb: "remove", at: "beat:start", target: "old" },
      { id: "s_form", verb: "show", at: "cue:c_formule", target: "form" },
    ]), cues);
    expect(timed.do.map((action) => [action.id, "at" in action ? action.at : undefined])).toEqual([
      ["f_tab", "cue:c_formule"], ["r_old", "cue:c_formule"], ["s_form", "cue:c_formule"],
    ]);
  });

  it("ne change rien quand le passage montre aussi quelque chose dès son début, ou rien de nouveau", () => {
    const atStart = passage([
      { id: "f_tab", verb: "fade_out", at: "beat:start", target: "tab" },
      { id: "s_form", verb: "show", at: "beat:start", target: "form" },
    ]);
    expect(clearWithFirstReveal(atStart, cues)).toBe(atStart);
    const nothingNew = passage([{ id: "f_tab", verb: "fade_out", at: "beat:start", target: "tab" }]);
    expect(clearWithFirstReveal(nothingNew, cues)).toBe(nothingNew);
  });
});
