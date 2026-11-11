import { describe, expect, it } from "vitest";
import shell from "./engineShell.json";
import { Slice } from "./contract";
import { createScene, introduceSlice } from "./sceneState";
import { validateLesson, validateModelOutput } from "./validate";
import { playNesalioLesson, type NesalioClip, type NesalioFrame } from "@/engine/nesalioPlayback";

const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
const steps = [
  { id: "e1", type: "math", content: "3x + 5 = 17" },
  { id: "e2", type: "math", content: "3x = 12" },
  { id: "e3", type: "math", content: "x = 4" },
];
const solving = (todo: unknown[][]) => ({
  slice_id: "s",
  introduces: [...steps, { id: "note", type: "text", content: "On isole x" }],
  beats: todo.map((actions, i) => ({ id: `b${i}`, say: "On continue le calcul.", cues: [], do: actions })),
});
const transform = (id: string, source: string, target: string) => ({ id, verb: "transform", source, target, at: "beat:start" });

describe("transform : une étape de calcul devient la suivante, sur place", () => {
  it("n’accepte que des formules, et une seule fois la même cible", () => {
    expect(validateModelOutput({ slices: [solving([[transform("t", "note", "e2")]])] })).toMatchObject({
      ok: false,
      issues: [{ message: expect.stringContaining("formules") }],
    });
    expect(validateModelOutput({ slices: [solving([[transform("t1", "e1", "e2")], [transform("t2", "e3", "e2")]])] })).toMatchObject({
      ok: false,
      issues: [{ message: expect.stringContaining("déjà la cible") }],
    });
    expect(validateModelOutput({ slices: [solving([[transform("t1", "e1", "e2")], [transform("t2", "e2", "e3")]])] }).ok).toBe(true);
  });

  it("place chaque étape à la place de la précédente, au lieu de l’empiler", () => {
    const scene = introduceSlice(createScene(viewport), Slice.parse(solving([[transform("t1", "e1", "e2")], [transform("t2", "e2", "e3")]])));
    const left = (id: string) => scene.objects.get(id)!.position[0] + scene.objects.get(id)!.measurement.body.x0;
    const middle = (id: string) => scene.objects.get(id)!.position[1];
    expect(left("e2")).toBeCloseTo(left("e1"), 6);
    expect(left("e3")).toBeCloseTo(left("e1"), 6);
    expect(middle("e2")).toBeCloseTo(middle("e1"), 6);
    expect(middle("e3")).toBeCloseTo(middle("e1"), 6);
  });

  it("joue la métamorphose sur la source, puis montre la cible et retire la source", async () => {
    const lesson = validateLesson({
      ...shell,
      slices: [solving([[{ id: "w1", verb: "write", target: "e1", at: "beat:start" }], [transform("t1", "e1", "e2")]])],
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
      openClip: async (beat) => (beat.id === "b0" ? clip([2_000]) : clip([450, 2_000])),
      onFrame: (frame, beat) => {
        if (beat.id === "b1") frames.push(frame);
      },
    });
    const [during, after] = frames as [NesalioFrame, NesalioFrame];
    expect(during.morphs.get("e1")).toMatchObject({ target: "e2", progress: 0.5 });
    expect(during.opacity.get("e1")).toBe(0);
    expect(during.scene.objects.get("e2")!.visible).toBe(false);
    expect(after.morphs.size).toBe(0);
    expect(after.scene.objects.get("e2")!.visible).toBe(true);
    expect(after.scene.objects.get("e1")!.visible).toBe(false);
  });

  it("envoie un geste visant une formule transformée à celle qui l’a remplacée", async () => {
    const todo = [
      [{ id: "w1", verb: "write", target: "e1", at: "beat:start" }],
      [transform("t1", "e1", "e2")],
      // The model still names « e1 »: it means the formula standing there now.
      [{ id: "h", verb: "highlight", target: "e1", role: "result", at: "beat:start" }, transform("t2", "e1", "e3")],
    ];
    const lesson = validateLesson({ ...shell, slices: [solving(todo)] });
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
      openClip: async (beat) => (beat.id === "b2" ? clip([100, 2_000]) : clip([2_000])),
      onFrame: (frame, beat) => {
        if (beat.id === "b2") frames.push(frame);
      },
    });
    const [early, end] = frames as [NesalioFrame, NesalioFrame];
    expect(early.highlights.has("e2")).toBe(true);
    expect(early.morphs.get("e2")).toMatchObject({ target: "e3" });
    expect(end.scene.objects.get("e3")!.visible).toBe(true);
    expect(end.scene.objects.get("e2")!.visible).toBe(false);
  });

  it("refuse de placer un objet par rapport à une formule remplacée, en nommant la remplaçante", () => {
    const first = validateModelOutput({ slices: [solving([[transform("t1", "e1", "e2")]])] });
    if (!first.ok) throw new Error(JSON.stringify(first.issues));
    const next = validateModelOutput(
      {
        slices: [
          {
            slice_id: "s2",
            introduces: [{ id: "c", type: "text", content: "Bien", layout: { next_to: "e1", direction: "right" } }],
            beats: [{ id: "c1", say: "Bien.", cues: [], do: [] }],
          },
        ],
      },
      first.state,
    );
    expect(next).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining("« e2 »") }] });
  });
});
