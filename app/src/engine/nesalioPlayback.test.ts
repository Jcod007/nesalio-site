import { interpolateZoom } from "d3-interpolate";
import { describe, expect, it } from "vitest";
import shell from "@/domain/nesalio/engineShell.json";
import { validateLesson } from "@/domain/nesalio/validate";
import { CAMERA_ZOOM, inside, partVisible, sceneBounds, visibleArea } from "@/domain/nesalio/sceneState";
import { PAUSE_MS, playNesalioLesson, playNesalioStream, type NesalioClip, type NesalioFrame, type NesalioWarning } from "./nesalioPlayback";

/** Audio stand-in: the real player is driven only by the playheads it is given. */
function clip(cues: Record<string, [number, number]>, durationMs: number, playheads: number[]): NesalioClip {
  return {
    durationMs,
    cues: new Map(Object.entries(cues).map(([id, [start, end]]) => [id, { start, end }])),
    async play(draw) { for (const playhead of playheads) draw(playhead); },
    dispose() {},
  };
}

/** Two passages: the first shows `a` on « premier » then highlights it; the second shows `b` on « second ». */
function twoPassages() {
  const lesson = validateLesson({
    ...shell,
    slices: [{
      slice_id: "s",
      introduces: [{ id: "a", type: "point", params: { at: [0, 0] } }, { id: "b", type: "point", params: { at: [2, 0] } }],
      beats: [
        { id: "one", say: "Voici le premier point.", cues: [{ id: "first", text: "premier" }],
          do: [{ id: "show_a", verb: "show", target: "a", at: "cue:first" }, { id: "mark_a", verb: "set_style", target: "a", role: "accent", at: "after:show_a" }] },
        { id: "two", say: "Puis le second.", cues: [{ id: "second", text: "second" }],
          do: [{ id: "show_b", verb: "show", target: "b", at: "cue:second" }] },
      ],
    }],
  });
  if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
  return lesson.value;
}

describe("filet de sécurité de la lecture Nesalio", () => {
  const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
  const visible = (frame: NesalioFrame) => [...frame.scene.objects].filter(([, o]) => o.visible).map(([id]) => id);

  it("reporte en fin de passage un geste dont le repère n’a pas d’heure, sans arrêter la leçon", async () => {
    const warnings: unknown[] = [];
    const frames: [string, number, string[], string | undefined][] = [];
    await playNesalioLesson(twoPassages(), {
      viewport, signal: new AbortController().signal,
      openClip: async (beat) => beat.id === "one" ? clip({}, 1_000, [200, 900]) : clip({ second: [300, 500] }, 800, [400]),
      onFrame: (frame, beat, playhead) => frames.push([beat.id, playhead, visible(frame), frame.styles.get("a")]),
      onWarning: (warning) => warnings.push(warning),
    });
    expect(frames).toEqual([
      ["one", 200, [], undefined],
      ["one", 900, [], undefined],
      ["one", 1_000, ["a"], "accent"],
      ["two", 400, ["a", "b"], "accent"],
    ]);
    expect(warnings).toEqual([
      { beat: "one", kind: "deferred", action: "show_a", reason: expect.stringContaining("« first »") },
      { beat: "one", kind: "deferred", action: "mark_a", reason: expect.stringContaining("Attend") },
    ]);
  });

  it("réessaie une fois la voix, puis montre le passage sans voix et continue", async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    const warnings: { beat: string; kind: string }[] = [];
    const frames: [string, number, string[]][] = [];
    await playNesalioLesson(twoPassages(), {
      viewport, signal: new AbortController().signal,
      openClip: async (beat) => {
        calls.push(beat.id);
        if (beat.id === "one") throw new Error("Voix indisponible pour le moment.");
        return clip({ second: [300, 500] }, 800, [400]);
      },
      onFrame: (frame, beat, playhead) => frames.push([beat.id, playhead, visible(frame)]),
      onWarning: (warning) => warnings.push(warning),
      wait: async (ms) => { waits.push(ms); },
    });
    expect(calls.filter((id) => id === "one")).toHaveLength(2);
    expect(warnings).toMatchObject([{ beat: "one", kind: "silent", reason: "Voix indisponible pour le moment." }]);
    expect(waits).toEqual([1_600, PAUSE_MS.default]);
    expect(frames).toEqual([["one", 0, ["a"]], ["two", 400, ["a", "b"]]]);
  });

  it("n’affiche aucun avertissement quand le second essai de la voix réussit", async () => {
    let failures = 1;
    const warnings: unknown[] = [];
    await playNesalioLesson(twoPassages(), {
      viewport, signal: new AbortController().signal,
      openClip: async (beat) => {
        if (beat.id === "one" && failures-- > 0) throw new Error("Coupure réseau.");
        return beat.id === "one" ? clip({ first: [100, 400] }, 1_000, [500]) : clip({ second: [300, 500] }, 800, [400]);
      },
      onFrame: () => {},
      onWarning: (warning) => warnings.push(warning),
    });
    expect(warnings).toEqual([]);
  });

  it("complète le tableau quand l’audio s’interrompt en cours de lecture", async () => {
    const warnings: { kind: string; reason: string }[] = [];
    const frames: [string, number, string[]][] = [];
    await playNesalioLesson(twoPassages(), {
      viewport, signal: new AbortController().signal,
      openClip: async (beat) => beat.id === "one"
        ? { ...clip({ first: [600, 800] }, 1_000, []), play: async (draw) => { draw(100); throw new Error("Lecture audio interrompue."); } }
        : clip({ second: [300, 500] }, 800, [400]),
      onFrame: (frame, beat, playhead) => frames.push([beat.id, playhead, visible(frame)]),
      onWarning: (warning) => warnings.push(warning),
    });
    expect(warnings).toMatchObject([{ kind: "deferred", reason: expect.stringContaining("interrompue") }]);
    expect(frames).toEqual([["one", 100, []], ["one", 1_000, ["a"]], ["two", 400, ["a", "b"]]]);
  });
});

describe("lecture Nesalio des formules en parties", () => {
  it("écrit chaque partie sur son propre mot, sans montrer les suivantes", async () => {
    const lesson = validateLesson({
      ...shell,
      slices: [{
        slice_id: "s_sum",
        introduces: [{
          id: "sum", type: "math", content: "9 + 16 = 25",
          parts: [{ id: "p9", text: "9" }, { id: "p16", text: "+ 16" }, { id: "p25", text: "= 25" }],
        }],
        beats: [{
          id: "b", say: "Nous obtenons neuf plus seize, soit vingt-cinq.",
          cues: [{ id: "nine", text: "neuf" }, { id: "sixteen", text: "seize" }, { id: "total", text: "vingt-cinq" }],
          do: [
            { id: "w9", verb: "write", target: "sum", part: "p9", at: "cue:nine" },
            { id: "w16", verb: "write", target: "sum", part: "p16", at: "cue:sixteen" },
            { id: "w25", verb: "write", target: "sum", part: "p25", at: "cue:total" },
          ],
        }],
      }],
    });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const frames = new Map<number, NesalioFrame>();
    const playheads = [500, 1100, 1500, 2100, 2500, 3200, 3600];
    await playNesalioLesson(lesson.value, {
      viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 },
      signal: new AbortController().signal,
      openClip: async () => clip({ nine: [1000, 1300], sixteen: [2000, 2400], total: [3100, 3700] }, 4000, playheads),
      onFrame: (frame, _beat, playhead) => frames.set(playhead, frame),
    });
    const visibleParts = (playhead: number) => {
      const sum = frames.get(playhead)!.scene.objects.get("sum")!;
      return ["p9", "p16", "p25"].filter((part) => partVisible(sum, part));
    };
    expect(visibleParts(500)).toEqual([]);
    expect(visibleParts(1100)).toEqual(["p9"]);
    expect(frames.get(1100)!.partReveals.get("sum")?.get("p9")?.progress).toBeCloseTo(100 / 320);
    expect(visibleParts(1500)).toEqual(["p9"]);
    expect(frames.get(1500)!.partReveals.get("sum")?.get("p9")?.progress ?? 1).toBe(1);
    expect(visibleParts(2100)).toEqual(["p9", "p16"]);
    expect(visibleParts(2500)).toEqual(["p9", "p16"]);
    expect(visibleParts(3200)).toEqual(["p9", "p16", "p25"]);
    expect(frames.get(3600)!.scene.objects.get("sum")!.revealedParts).toBeUndefined();
  });
});

describe("lecture Nesalio en flux", () => {
  it("joue la première tranche sans attendre la suivante, puis attend celle qui tarde", async () => {
    const lesson = twoPassages();
    const [first] = lesson.slices;
    const second = { ...first!, slice_id: "s2", introduces: [{ id: "c", type: "point" as const, params: { at: [4, 0] as [number, number] } }],
      beats: [{ id: "three", say: "Et un troisième.", cues: [{ id: "third", text: "troisième" }], do: [{ id: "show_c", verb: "show" as const, target: "c", at: "cue:third" }] }] };
    let release!: () => void;
    const late = new Promise<void>((resolve) => { release = resolve; });
    const log: string[] = [];
    const source = (async function* () { yield first!; await late; yield second; })();
    await playNesalioStream(lesson, source, {
      viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, signal: new AbortController().signal,
      openClip: async (beat) => {
        log.push(`voix:${beat.id}`);
        if (beat.id === "two") setTimeout(release, 0);
        return clip({ first: [100, 300], second: [100, 300], third: [100, 300] }, 500, [400]);
      },
      onFrame: (_frame, beat) => log.push(`image:${beat.id}`),
      onWaiting: () => log.push("attente"),
      wait: async () => {},
    });
    expect(log).toEqual(["attente", "voix:one", "image:one", "voix:two", "image:two", "attente", "voix:three", "image:three"]);
  });
});

describe("caméra Nesalio", () => {
  const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };

  async function cameraPassage(x: number, actions: unknown[], playheads: number[], durationMs = 2_000) {
    const lesson = validateLesson({ ...shell, slices: [{
      slice_id: "s",
      introduces: [
        { id: "origin", type: "point", params: { at: [0, 0] } },
        { id: "target", type: "point", params: { at: [x, 0] } },
        { id: "nearby", type: "point", params: { at: [x + 2.5, 0] } },
      ],
      beats: [{ id: "b", say: "Regarde le point, puis sa place.", cues: [{ id: "c", text: "point" }, { id: "d", text: "place" }], do: actions }],
    }] });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const frames = new Map<number, NesalioFrame>();
    await playNesalioLesson(lesson.value, {
      viewport, signal: new AbortController().signal, wait: async () => {},
      openClip: async () => clip({ c: [100, 200], d: [500, 1_000] }, durationMs, playheads),
      onFrame: (frame, _beat, time) => frames.set(time, frame),
    });
    return (time: number) => frames.get(time)!;
  }

  // Durations since 2026-11-09 (camera comfort): D3's length × pace × 1.6, between 0.8 and 2.2 s (CAMERA_MOVE_MS).
  it.each([
    { x: 0, pace: undefined, duration: 800 },
    { x: 6, pace: "quick", duration: 800 },
    { x: 6, pace: undefined, duration: 1_094.4 },
    { x: 6, pace: "slow", duration: 2_052 },
    { x: 120, pace: undefined, duration: 2_200 },
  ])("cale after: sur la durée du cadrage vers $x (allure $pace)", async ({ x, pace, duration }) => {
    const end = 100 + duration;
    const frame = await cameraPassage(x, [
      { id: "focus", verb: "camera.focus", targets: ["target"], at: "cue:c", pace },
      { id: "style", verb: "set_style", target: "target", role: "accent", at: "after:focus" },
    ], [99, 100, end - 1, end], 3_000);
    expect(frame(99).scene.camera.is_animating).toBe(false);
    expect(frame(100).scene.camera.is_animating).toBe(true);
    expect(frame(end - 1).styles.has("target")).toBe(false);
    expect(frame(end).styles.get("target")).toBe("accent");
    expect(frame(end).scene.camera.state).toEqual({ x, y: 0, zoom: CAMERA_ZOOM.max });
  });

  it("échantillonne D3 entre les repères explicites et borne le zoom sur un long trajet", async () => {
    const frame = await cameraPassage(120, [
      { id: "focus", verb: "camera.focus", targets: ["target"], start: "cue:c", end: "cue_end:d" },
      { id: "style", verb: "set_style", target: "target", role: "accent", at: "after:focus" },
    ], [550, 999, 1_000]);
    const [x, y, width] = interpolateZoom([0, 0, 16], [120, 0, 16 / CAMERA_ZOOM.max])(0.5);
    expect(16 / width).toBeLessThan(CAMERA_ZOOM.min);
    const middle = frame(550).scene.camera;
    expect(middle.state.x).toBeCloseTo(x);
    expect(middle.state.y).toBeCloseTo(y);
    expect(middle.state.zoom).toBe(CAMERA_ZOOM.min);
    expect(middle.target_state?.x).toBe(120);
    expect(frame(999).styles.has("target")).toBe(false);
    expect(frame(1_000).styles.get("target")).toBe("accent");
  });

  it("coupe le trajet à la fin du clip et y déclenche le geste qui l'attend", async () => {
    const frame = await cameraPassage(120, [
      { id: "focus", verb: "camera.focus", targets: ["target"], at: "cue:c" },
      { id: "style", verb: "set_style", target: "target", role: "accent", at: "after:focus" },
    ], [399, 400], 400);
    expect(frame(399).scene.camera.is_animating).toBe(true);
    expect(frame(399).styles.has("target")).toBe(false);
    expect(frame(400).scene.camera.state.x).toBe(120);
    expect(frame(400).scene.camera.is_animating).toBe(false);
    expect(frame(400).styles.get("target")).toBe("accent");
  });

  it("ignore un petit recadrage fluide et exécute tout de même un cadrage instantané", async () => {
    const frame = await cameraPassage(0.1, [
      { id: "initial", verb: "camera.focus", targets: ["origin"], at: "beat:start", transition: "instant" },
      { id: "small", verb: "camera.focus", targets: ["target"], at: "cue:c" },
      { id: "style", verb: "set_style", target: "target", role: "accent", at: "after:small" },
      { id: "jump", verb: "camera.focus", targets: ["target"], at: "cue:d", transition: "instant" },
    ], [100, 499, 500]);
    expect(frame(100).styles.get("target")).toBe("accent");
    expect(frame(499).scene.camera.state.x).toBe(0);
    expect(frame(500).scene.camera.state.x).toBeCloseTo(0.1);
    expect(frame(500).scene.camera.is_animating).toBe(false);
  });

  it("cadre d'avance, en un seul trajet dès le début du passage, ce que le passage va montrer", async () => {
    // Since 2026-11-09 (camera comfort): one movement framing both points to come, instead of one per point.
    const frame = await cameraPassage(120, [
      { id: "first", verb: "show", target: "target", at: "cue:c" },
      { id: "second", verb: "show", target: "nearby", at: "cue_end:c" },
    ], [50, 100, 200, 700, 2_000]);
    const destination = frame(50).scene.camera.target_state!;
    expect(frame(50).scene.camera.is_animating).toBe(true);
    // Centred between the two points (120 and 122.5), the same destination all along.
    expect(destination.x).toBeCloseTo(121.25);
    for (const time of [100, 200, 700]) expect(frame(time).scene.camera.target_state).toEqual(destination);
    expect(frame(2_000).scene.camera.state.x).toBeCloseTo(121.25);
  });

  it.each([
    { title: "la révélation avant le surlignage", reveal: true, highlight: true, expected: "new", keep: false },
    { title: "le surlignage avant la dernière cible", reveal: false, highlight: true, expected: "summary", keep: true },
    { title: "la dernière cible sans révélation ni surlignage", reveal: false, highlight: false, expected: "history", keep: false },
  ])("privilégie $title quand le récapitulatif ne tient pas", async ({ reveal, highlight, expected, keep }) => {
    const lesson = validateLesson({ ...shell, slices: [{
      slice_id: "s",
      introduces: [
        { id: "summary", type: "point", params: { at: [0, 0] } },
        { id: "new", type: "point", params: { at: [-40, 0] } },
        { id: "history", type: "point", params: { at: [40, 0] } },
        { id: "corner", type: "text", content: "Repère", layout: { to_corner: "top_left" } },
      ],
      beats: [
        { id: "intro", say: "Voici les éléments du tableau.", cues: [], do: [
          { id: "s1", verb: "show", target: "summary", at: "beat:start" },
          { id: "s2", verb: "show", target: "history", at: "beat:start" },
          { id: "s3", verb: "show", target: "corner", at: "beat:start" },
        ] },
        { id: "recap", say: "Retenons ce point.", cues: [{ id: "c", text: "point" }], do: [
          { id: "f", verb: "camera.focus", targets: ["summary", ...(reveal ? ["new"] : []), "history"], at: "beat:start", transition: "instant" },
          ...(highlight ? [{ id: "h", verb: "highlight", target: "summary", at: "cue:c" }] : []),
          ...(reveal ? [{ id: "s4", verb: "show", target: "new", at: "cue:c" }] : []),
        ] },
      ],
    }] });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const warnings: NesalioWarning[] = [];
    let recap: NesalioFrame | undefined;
    await playNesalioLesson(lesson.value, {
      viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, signal: new AbortController().signal,
      openClip: async () => clip({ c: [500, 700] }, 1_000, [100, 1_000]),
      onFrame: (frame, beat, playhead) => { if (beat.id === "recap" && playhead === 100) recap = frame; },
      onWarning: (warning) => warnings.push(warning), wait: async () => {},
    });
    const { scene } = recap!;
    const inView = (id: string) => inside(visibleArea(scene), sceneBounds(scene, [id], "layout_bounds")!);
    expect(inView(expected)).toBe(true);
    expect(inView("corner")).toBe(keep);
    expect(scene.camera.state.zoom).toBeGreaterThan(CAMERA_ZOOM.min);
    const warning = warnings.find(({ beat, action }) => beat === "recap" && action === "f");
    expect(warning?.kind).toBe("framing");
    expect(warning?.reason.includes("corner")).toBe(!keep);
  });

  it("cadre la place réservée de ce qui va apparaître quand rien n’est encore visible", async () => {
    const lesson = validateLesson({
      ...shell,
      slices: [{
        slice_id: "s",
        introduces: [{ id: "far", type: "point", params: { at: [6, 3] } }],
        beats: [{ id: "b", say: "Regarde ce point.", cues: [{ id: "c", text: "point" }],
          do: [{ id: "f", verb: "camera.focus", targets: ["far"], at: "beat:start", transition: "instant" }, { id: "s", verb: "show", target: "far", at: "cue:c" }] }],
      }],
    });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const cameras: { x: number; y: number }[] = [];
    await playNesalioLesson(lesson.value, {
      viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, signal: new AbortController().signal,
      openClip: async () => clip({ c: [300, 500] }, 800, [100]),
      onFrame: (frame) => cameras.push(frame.scene.camera.state),
    });
    expect(cameras[0]!.x).toBeCloseTo(6);
    expect(cameras[0]!.y).toBeCloseTo(3);
  });
});

describe("retour à un cadrage mémorisé", () => {
  const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };
  const beat = (id: string, actions: unknown[]) => ({ id, say: "Puis revenons à la vue d'ensemble.", cues: [{ id: "retour", text: "revenons" }], do: actions });

  async function play(slices: unknown[], playheads = [1_600]) {
    const lesson = validateLesson({ ...shell, slices });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const frames = new Map<string, NesalioFrame>();
    const warnings: NesalioWarning[] = [];
    await playNesalioLesson(lesson.value, {
      viewport, signal: new AbortController().signal, wait: async () => {},
      openClip: async () => clip({ retour: [200, 700] }, 1_600, playheads),
      onFrame: (frame, passage, time) => frames.set(`${passage.id}:${time}`, frame),
      onWarning: (warning) => warnings.push(warning),
    });
    return { frame: (id: string, time = 1_600) => frames.get(`${id}:${time}`)!, warnings };
  }

  it("recadre le membre remplacé et déplacé d'un groupe, sans son membre effacé, avec l'objet gardé", async () => {
    const { frame, warnings } = await play([
      {
        slice_id: "s1",
        introduces: [
          { id: "old", type: "math", content: "x + 1 = 3" }, { id: "new", type: "math", content: "x = 2" },
          { id: "gone", type: "point", params: { at: [-10, 0] } }, { id: "anchor", type: "point", params: { at: [18, 0] } },
          { id: "kept", type: "text", content: "Repère", layout: { to_corner: "top_right" } },
        ],
        groups: [{ id: "ensemble", items: ["old", "gone"] }],
        beats: [
          beat("save", [
            { id: "cadre", verb: "camera.focus", targets: ["ensemble"], bounds: "layout_bounds", save_as: "vue", at: "beat:start", transition: "instant" },
            { id: "show", verb: "show", target: "old", at: "beat:start" },
            { id: "keep", verb: "show", target: "kept", at: "beat:start" },
          ]),
          beat("edit", [{ id: "morph", verb: "transform", source: "old", target: "new", at: "beat:start" },
            { id: "erase", verb: "remove", target: "gone", at: "beat:start" }]),
          beat("shift", [{ id: "move", verb: "move", target: "new", to: { center_on: "anchor" }, at: "beat:start" }]),
        ],
      },
      { slice_id: "s2", introduces: [], beats: [beat("back", [
        { id: "back", verb: "camera.restore", frame: "vue", at: "cue:retour", transition: "instant" },
      ])] },
    ]);
    const { scene } = frame("back");
    const saved = frame("save").scene.savedCamera.get("vue")!;
    expect(saved).toMatchObject({ targets: ["ensemble"], bounds: "layout_bounds" });
    expect(scene.objects.get("gone")?.removed).toBe(true);
    expect(scene.camera.state.x).toBeGreaterThan(saved.state.x + 5);
    for (const id of ["new", "kept"]) expect(inside(visibleArea(scene), sceneBounds(scene, [id], "render_bounds")!)).toBe(true);
    expect(warnings.filter(({ beat }) => beat === "back")).toEqual([]);
  });

  it("utilise la position sauvegardée si la cible n'est plus au tableau et synchronise after: avec le retour", async () => {
    const { frame } = await play([{ slice_id: "s", introduces: [
      { id: "origin", type: "point", params: { at: [0, 0] } }, { id: "detail", type: "point", params: { at: [120, 0] } },
    ], beats: [
      beat("save", [{ id: "save", verb: "camera.focus", targets: ["origin"], bounds: "layout_bounds", save_as: "vue", at: "beat:start", transition: "instant" },
        { id: "show", verb: "show", target: "origin", at: "beat:start" }]),
      beat("shift", [{ id: "move", verb: "move", target: "origin", to: { center_on: "detail" }, at: "beat:start" }]),
      beat("detail", [{ id: "hide", verb: "fade_out", target: "origin", at: "beat:start" },
        { id: "detail", verb: "camera.focus", targets: ["detail"], at: "beat:start", transition: "instant" }]),
      beat("back", [{ id: "back", verb: "camera.restore", frame: "vue", at: "cue:retour" },
        { id: "accent", verb: "set_style", target: "detail", role: "accent", at: "after:back" }]),
    ] }], [199, 800, 1_399, 1_600]);
    const saved = frame("save").scene.savedCamera.get("vue")!.state;
    expect(frame("detail").scene.objects.get("origin")?.position[0]).toBe(120);
    expect(frame("back", 199).scene.camera.state.x).toBe(120);
    expect(frame("back", 800).scene.camera.target_state).toEqual(saved);
    // Slower since 2026-11-09 (up to 2.2 s): still on its way at 0.8 s and 1.4 s.
    expect(frame("back", 800).scene.camera.state.x).toBeGreaterThan(0);
    expect(frame("back", 800).scene.camera.state.x).toBeLessThan(120);
    expect(frame("back", 1_399).styles.has("detail")).toBe(false);
    // The trip is cut at the end of the clip: the camera is there and the waiting gesture fires.
    expect(frame("back", 1_600).scene.camera.state).toEqual(saved);
    expect(frame("back", 1_600).styles.get("detail")).toBe("accent");
  });
});

describe("silences entre les passages", () => {
  it("respecte pause_after, et laisse un court souffle par défaut", async () => {
    const lesson = twoPassages();
    lesson.slices[0]!.beats[0]!.pause_after = "long";
    const waits: number[] = [];
    await playNesalioLesson(lesson, {
      viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, signal: new AbortController().signal,
      openClip: async () => clip({ first: [100, 300], second: [100, 300] }, 500, [400]),
      onFrame: () => {},
      wait: async (ms) => { waits.push(ms); },
    });
    expect(waits).toEqual([PAUSE_MS.long, PAUSE_MS.default]);
  });
});

describe("surlignage d’une partie dans la lecture", () => {
  it("ne colore que la partie visée, pendant le surlignage", async () => {
    const lesson = validateLesson({
      ...shell,
      slices: [{
        slice_id: "s",
        introduces: [{ id: "eq", type: "math", content: "3x + 5 = 17", parts: [{ id: "x", text: "3x" }, { id: "rest", text: "+ 5 = 17" }] }],
        beats: [{ id: "b", say: "On met en évidence x.", cues: [{ id: "c", text: "x" }],
          do: [{ id: "w", verb: "write", target: "eq", at: "beat:start" }, { id: "h", verb: "highlight", target: "eq", part: "x", at: "cue:c", pace: "slow" }] }],
      }],
    });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const frames: NesalioFrame[] = [];
    await playNesalioLesson(lesson.value, {
      viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, signal: new AbortController().signal,
      openClip: async () => clip({ c: [400, 500] }, 1_500, [500]),
      onFrame: (frame) => frames.push(frame), wait: async () => {},
    });
    expect(frames[0]!.partHighlights.get("eq")?.get("x")).toMatchObject({ role: "accent" });
    expect(frames[0]!.highlights.has("eq")).toBe(false);
  });
});

describe("la caméra suit ce qui apparaît", () => {
  const viewport = { x0: -8, y0: -4.5, x1: 8, y1: 4.5 };

  it("cadre un objet qui apparaîtrait hors champ, même sans camera.focus", async () => {
    // A tall column of steps: the last ones are placed far below the first view.
    const steps = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, type: "text", content: `Étape numéro ${i} du calcul`, size: "large" }));
    const lesson = validateLesson({ ...shell, slices: [{
      slice_id: "s", introduces: steps,
      beats: [{ id: "b", say: "On écrit toutes les étapes.", cues: [],
        do: steps.map(({ id }) => ({ id: `w_${id}`, verb: "write", target: id, at: "beat:start" })) }],
    }] });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    let last: NesalioFrame | undefined;
    await playNesalioLesson(lesson.value, {
      viewport, signal: new AbortController().signal, wait: async () => {},
      openClip: async () => clip({}, 2_000, [2_000]),
      onFrame: (frame) => { last = frame; },
    });
    const { scene } = last!;
    const { x, y, zoom } = scene.camera.state;
    const view = { x0: x - 8 / zoom, x1: x + 8 / zoom, y0: y - 4.5 / zoom, y1: y + 4.5 / zoom };
    const lastStep = scene.objects.get("e7")!;
    const [, py] = lastStep.position;
    expect(py + lastStep.measurement.body.y0).toBeGreaterThanOrEqual(view.y0 - 1e-6);
    expect(scene.camera.is_animating).toBe(false);
  });

  // Essais du 2026-11-10 : le moteur cadrait une formule seule à ×1,5, lettres de 90 px (« zoom excessif »).
  it("ne grossit pas le texte au-delà de sa taille quand il cadre de lui-même", async () => {
    const lesson = validateLesson({ ...shell, slices: [
      { slice_id: "s1", introduces: [{ id: "a", type: "math", content: "x = 2" }],
        beats: [{ id: "b1", say: "Voici.", cues: [], do: [{ id: "w1", verb: "write", target: "a", at: "beat:start" }] }] },
      { slice_id: "s2", introduces: [{ id: "b", type: "math", content: "y = 3", layout: { next_to: "a", direction: "down", gap: "xl" } },
        { id: "c", type: "math", content: "z = 4", layout: { to_corner: "bottom_right" } }],
        beats: [{ id: "b2", say: "Puis.", cues: [], do: [
          { id: "f", verb: "fade_out", target: "a", at: "beat:start" },
          { id: "w2", verb: "write", target: "b", at: "beat:start" }, { id: "w3", verb: "write", target: "c", at: "beat:start" },
        ] }] },
    ] });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    let closest = 0;
    await playNesalioLesson(lesson.value, {
      viewport, signal: new AbortController().signal, wait: async () => {},
      openClip: async () => clip({}, 2_000, [0, 1_000, 2_000]),
      onFrame: (frame) => { closest = Math.max(closest, frame.scene.camera.state.zoom); },
    });
    expect(closest).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("question à l'élève après une tranche", () => {
  it("attend la fin de chaque tranche, tableau encore affiché, avant la suivante et avant la fin", async () => {
    const tranche = (id: string) => ({ slice_id: id, introduces: [{ id: `t_${id}`, type: "text", content: `Texte ${id}` }],
      beats: [1, 2].map((n) => ({ id: `${id}_b${n}`, say: "Voici.", cues: [], do: n === 1 ? [{ id: `s_${id}`, verb: "show", target: `t_${id}`, at: "beat:start" }] : [] })) });
    const lesson = validateLesson({ ...shell, slices: [tranche("s1"), tranche("s2")] });
    if (!lesson.ok) throw new Error(JSON.stringify(lesson.issues));
    const order: string[] = [];
    await playNesalioLesson(lesson.value, {
      viewport: { x0: -8, y0: -4.5, x1: 8, y1: 4.5 }, signal: new AbortController().signal, wait: async () => {},
      openClip: async () => clip({}, 1_000, [1_000]),
      onFrame: (frame, beat) => { if (order.at(-1) !== beat.id) order.push(beat.id); },
      afterSlice: async (id) => { order.push(`question après ${id}`); },
    });
    expect(order).toEqual(["s1_b1", "s1_b2", "question après s1", "s2_b1", "s2_b2", "question après s2"]);
  });
});
