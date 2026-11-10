import { describe, expect, it } from "vitest";
import { compileNamedExpression } from "@/domain/math/expr";
import { alignBeatCues } from "./alignment";
import { NESALIO_VOCABULARY, negotiateCapabilities } from "./capabilities";
import { Beat, ExecutionEvent, RuntimeState } from "./contract";
import { sampleBeat, scheduleBeat } from "./scheduler";
import { validateModelOutput } from "./validate";

describe("contrat Nesalio", () => {
  it("porte la question pédagogique en dehors des actions de scène", () => {
    expect(ExecutionEvent.safeParse({ kind: "question", id: "compare", check: {
      prompt: "Quel vecteur a la plus grande composante verticale ?", choices: ["Le premier", "Le second"], answer: 0,
    } }).success).toBe(true);
    expect(ExecutionEvent.safeParse({ kind: "await" }).success).toBe(true);
    expect(ExecutionEvent.safeParse({ kind: "question", id: "compare", check: {
      prompt: "Quel vecteur a la plus grande composante verticale ?", choices: ["Le premier", "Le second"], answer: 2,
    } }).success).toBe(false);
  });

  it("distingue le vocabulaire officiel et les capacités réellement exécutables", () => {
    expect(NESALIO_VOCABULARY.categories.flatMap(({ terms }) => terms)).toHaveLength(81);
    const slice = {
      slice_id: "s_geometry",
      introduces: [{ id: "angle", type: "angle" }],
      beats: [{ id: "angle", say: "Observons cet angle.", cues: [], do: [] }],
    };
    expect(negotiateCapabilities(slice, { objects: new Set(), actions: new Set() })).toEqual([
      { name: "angle", status: "not-supported", path: ["introduces", 0, "type"] },
    ]);
    expect(validateModelOutput({ slices: [slice] })).toMatchObject({ ok: false, issues: [
      { message: expect.stringContaining("indisponible") },
    ] });
    slice.introduces[0]!.type = "invented";
    expect(validateModelOutput({ slices: [slice] })).toMatchObject({ ok: false, issues: [
      { message: expect.stringContaining("inconnue") },
    ] });
  });

  it("conserve les déclarations entre une tranche de graphique et un retour sur le tableau", () => {
    const first = validateModelOutput({
      slices: [{
        slice_id: "s_graph",
        introduces: [
          { id: "axes", type: "axes" },
          { id: "graph", type: "function_graph", params: { expression: "x^2 - 4" } },
        ],
        beats: [{ id: "intro", say: "Regardons la courbe.", cues: [], do: [
          { id: "draw_graph", verb: "draw", target: "graph", at: "beat:start" },
        ] }],
      }],
    });
    if (!first.ok) throw new Error(JSON.stringify(first.issues));
    const continuation = {
      slices: [{
        slice_id: "s_compare",
        introduces: [{
          id: "root_label", type: "label", content: "Racines", attachment: { parent: "graph", anchor: "roots" },
        }],
        beats: [{ id: "focus", say: "Revenons aux racines.", cues: [], do: [
          { id: "camera", verb: "camera.focus", targets: ["graph", "root_label"], at: "beat:start", bounds: "layout_bounds" },
        ] }],
      }],
    };
    expect(validateModelOutput(continuation, first.state).ok).toBe(true);
    expect(validateModelOutput(continuation).ok).toBe(false);
    expect([...first.state.objects]).toEqual(["axes", "graph"]);
  });

  it("valide un retour dans le même passage ou dans une autre tranche et refuse un nom réutilisé", () => {
    const save = { id: "save", verb: "camera.focus", targets: ["point"], save_as: "ensemble", at: "beat:start" };
    const restore = { id: "return", verb: "camera.restore", frame: "ensemble", at: "beat:start" };
    const slice = (slice_id: string, introduces: unknown[], actions: unknown[]) => ({
      slice_id, introduces, beats: [{ id: "b", say: "Revenons au point.", cues: [], do: actions }],
    });
    const first = validateModelOutput({ slices: [slice("s1", [{ id: "point", type: "point", params: { at: [0, 0] } }], [save, restore])] });
    if (!first.ok) throw new Error(JSON.stringify(first.issues));
    expect(validateModelOutput({ slices: [slice("s2", [], [restore])] }, first.state).ok).toBe(true);
    expect(validateModelOutput({ slices: [slice("s2", [], [save])] }, first.state)).toMatchObject({ ok: false, issues: [
      { path: ["slices", 0, "beats", 0, "do", 0, "save_as"], message: expect.stringContaining("déjà sauvegardé") },
    ] });
  });

  it("refuse de restaurer un cadrage déclaré après le retour ou sauvegardé sur un repère plus tardif", () => {
    const save = { id: "save", verb: "camera.focus", targets: ["point"], save_as: "ensemble", at: "cue:point" };
    const restore = { id: "return", verb: "camera.restore", frame: "ensemble", at: "beat:start" };
    const validate = (actions: unknown[]) => validateModelOutput({ slices: [{
      slice_id: "s", introduces: [{ id: "point", type: "point", params: { at: [0, 0] } }],
      beats: [{ id: "b", say: "Revenons au point.", cues: [{ id: "point", text: "point" }], do: actions }],
    }] });
    expect(validate([restore, save])).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining("non sauvegardé") }] });
    expect(validate([save, restore])).toMatchObject({ ok: false, issues: [{ message: expect.stringContaining("précède la sauvegarde") }] });
  });

  it("ordonne la sauvegarde avant le retour au même instant et reporte les deux si le repère manque", () => {
    const beat = Beat.parse({ id: "b", say: "Revenons au point.", cues: [{ id: "point", text: "point" }], do: [
      { id: "style", verb: "set_style", target: "point", role: "accent", at: "after:return" },
      { id: "save", verb: "camera.focus", targets: ["point"], save_as: "ensemble", at: "cue:point" },
      { id: "return", verb: "camera.restore", frame: "ensemble", at: "cue:point" },
    ] });
    const aligned = scheduleBeat(beat, new Map([["point", { start: 300, end: 500 }]]), 1_000, () => 0);
    expect(aligned.timeline.map(({ action }) => action.id)).toEqual(["save", "return", "style"]);
    const missing = scheduleBeat(beat, new Map(), 1_000, () => 0);
    expect(missing.deferred.map(({ action }) => action.id)).toEqual(["save", "return", "style"]);
    const early = Beat.parse({ ...beat, do: beat.do.map((action) => action.id === "return" ? { ...action, at: "beat:start" } : action) });
    expect(scheduleBeat(early, new Map([["point", { start: 300, end: 500 }]]), 1_000, () => 0).deferred.map(({ action }) => action.id))
      .toEqual(["return", "style"]);
  });

  it("signale une référence invalide avec son chemin et rejette les cycles de disposition", () => {
    const result = validateModelOutput({
      slices: [{
        slice_id: "s_algebra",
        introduces: [
          { id: "before", type: "math", content: "2x + 4 = 8", layout: { next_to: "after", direction: "up" } },
          { id: "after", type: "math", content: "x = 2", layout: { next_to: "before", direction: "down" } },
        ],
        beats: [{ id: "solve", say: "Isolons x.", cues: [], do: [
          { id: "write", verb: "write", target: "missing", at: "beat:start" },
        ] }],
      }],
    });
    expect(result).toMatchObject({ ok: false, issues: [
      { path: ["slices", 0], message: expect.stringContaining("cyclique") },
      { path: ["slices", 0, "beats", 0, "do", 0, "target"], message: expect.stringContaining("missing") },
    ] });
  });

  it("refuse les coordonnées de caméra et les champs du moteur dans la sortie du modèle", () => {
    const beat = { id: "view", say: "Cadrons le texte.", cues: [], do: [
      { id: "focus", verb: "camera.focus", targets: ["text"], at: "beat:start", x: 1, y: 0, zoom: 2 },
    ] };
    expect(Beat.safeParse(beat).success).toBe(false);
    expect(RuntimeState.safeParse({
      current_slice: null, current_beat: null, visible_objects: [],
      camera: { state: { x: 1, y: 0, zoom: 2 }, is_animating: false },
    }).success).toBe(true);
    expect(validateModelOutput({ runtime_state: {}, slices: [] }).ok).toBe(false);
  });

  it("refuse un repère accroché au milieu d’un mot", () => {
    const result = validateModelOutput({
      slices: [{
        slice_id: "s_letters",
        introduces: [{ id: "formula", type: "math", content: "a = b" }],
        beats: [{
          id: "letters", say: "Prenons un triangle.",
          cues: [{ id: "a", text: "a" }],
          do: [{ id: "show", verb: "show", target: "formula", at: "cue:a" }],
        }],
      }],
    });
    expect(result).toMatchObject({ ok: false, issues: [
      { path: ["slices", 0, "beats", 0, "cues", 0, "text"], message: expect.stringContaining("mots entiers") },
      { message: expect.stringContaining("Repère") },
    ] });
  });

  it("refuse un repère absent, une occurrence introuvable et une dépendance cyclique", () => {
    const result = validateModelOutput({
      slices: [{
        slice_id: "s_sequence",
        introduces: [{ id: "formula", type: "math", content: "a = b" }],
        beats: [{
          id: "sequence", say: "Voici la formule.",
          cues: [{ id: "again", text: "formule", occurrence: 2 }],
          do: [
            { id: "first", verb: "write", target: "formula", at: "after:second" },
            { id: "second", verb: "highlight", target: "formula", at: "after:first" },
            { id: "third", verb: "show", target: "formula", at: "cue:missing" },
          ],
        }],
      }],
    });
    expect(result).toMatchObject({ ok: false, issues: [
      { message: expect.stringContaining("Occurrence") },
      { message: expect.stringContaining("Repère") },
      { message: expect.stringContaining("cyclique") },
    ] });
  });

  it("valide les expressions nommées et les bornes d’un paramètre animé", () => {
    const input = {
      math_context: {
        symbols: { speed_now: { kind: "parameter", initial: 2, min: 0, max: 8 } },
        expressions: { energy: "speed_now^2 / 2" },
      },
      slices: [{
        slice_id: "s_physics",
        introduces: [{ id: "output", type: "math", content: { kind: "computed", expression_ref: "energy", template: "{value}", precision: 2 } }],
        beats: [{ id: "increase", say: "La vitesse augmente.", cues: [], do: [
          { id: "animate", verb: "animate_parameter", parameter: "speed_now", from: 2, to: 7, at: "beat:start" },
        ] }],
      }],
    };
    expect(validateModelOutput(input).ok).toBe(true);
    input.slices[0]!.beats[0]!.do[0]!.to = 10;
    expect(validateModelOutput(input)).toMatchObject({ ok: false, issues: [{ path: ["slices", 0, "beats", 0, "do", 0, "to"] }] });
    const evaluate = compileNamedExpression("1 / speed_now", new Set(["speed_now"]));
    expect(evaluate(new Map([["speed_now", 4]]))).toBe(0.25);
    expect(evaluate(new Map([["speed_now", 0]]))).toBeNull();
    expect(() => compileNamedExpression("speed_now^401", new Set(["speed_now"]))).toThrow("Exposant");
    // Banc Alloprof (caco3, interet-compose) : nombre d'Avogadro et 120 mois d'intérêt composé, en-têtes refusés.
    expect(compileNamedExpression("602200000000000000000000*2", new Set())(new Map())).toBeCloseTo(1.2044e24, -20);
    expect(compileNamedExpression("1000*(1+0.005)^120", new Set())(new Map())).toBeCloseTo(1819.4, 1);
    expect(() => compileNamedExpression("20000000000000000000000000000000", new Set())).toThrow("Constante hors limite");
    // floor and ceil: the integer part, announced by the prompt (P5); other names stay unknown.
    expect(compileNamedExpression("floor(speed_now)", new Set(["speed_now"]))(new Map([["speed_now", -1.5]]))).toBe(-2);
    expect(() => compileNamedExpression("round(speed_now)", new Set(["speed_now"]))).toThrow("Nom inconnu");
  });
});

describe("ordonnancement audio Nesalio", () => {
  it("associe deux occurrences d’un mot à leurs propres bornes dans le clip", () => {
    const repeated = Beat.parse({
      id: "repeat", say: "Un point puis un point.",
      cues: [{ id: "first", text: "point" }, { id: "second", text: "point", occurrence: 2 }], do: [],
    });
    const characters = [...repeated.say];
    const alignment = {
      characters,
      characterStartTimesSeconds: characters.map((_, index) => index / 10),
      characterEndTimesSeconds: characters.map((_, index) => (index + 1) / 10),
    };
    expect([...alignBeatCues(repeated, alignment)]).toEqual([
      ["first", { start: 300, end: 800 }], ["second", { start: 1700, end: 2200 }],
    ]);
    characters[17] = "l";
    expect(alignBeatCues(repeated, alignment).size).toBe(0);
  });

  const beat = Beat.parse({
    id: "compare",
    say: "On trace le premier trait, puis on compare.",
    cues: [
      { id: "trace", text: "premier trait", occurrence: 1 },
      { id: "compare", text: "compare", occurrence: 1 },
    ],
    do: [
      { id: "accent", verb: "highlight", target: "line", at: "after:draw" },
      { id: "draw", verb: "draw", target: "line", start: "cue:trace", end: "cue_end:compare" },
    ],
  });
  const alignment = new Map([["trace", { start: 400, end: 650 }], ["compare", { start: 1_300, end: 1_500 }]]);

  it("suit les bornes alignées et exécute after après la fin du tracé", () => {
    const { timeline, deferred } = scheduleBeat(beat, alignment, 2_000, () => 200);
    expect(deferred).toEqual([]);
    expect(timeline.map(({ action, start, end }) => [action.id, start, end])).toEqual([
      ["draw", 400, 1_500], ["accent", 1_500, 1_700],
    ]);
    expect(sampleBeat(timeline, 950)).toMatchObject([{ action: { id: "draw" }, progress: 0.5 }]);
    expect(sampleBeat(timeline, 950)).toEqual(sampleBeat(timeline, 950));
    expect(sampleBeat(timeline, 1_700)).toMatchObject([{ progress: 1 }, { progress: 1 }]);
    expect(sampleBeat(timeline, 0)).toEqual([]);
  });

  it("reporte un geste sans heure fiable, et ceux qui l’attendent, au lieu d’échouer", () => {
    const { timeline, deferred } = scheduleBeat(beat, new Map([["compare", { start: 1_300, end: 1_500 }]]), 2_000, () => 200);
    expect(timeline).toEqual([]);
    expect(deferred.map(({ action, reason }) => [action.id, reason])).toEqual([
      ["draw", expect.stringContaining("« trace »")],
      ["accent", expect.stringContaining("Attend « draw »")],
    ]);
  });

  it("ramène un léger dépassement à la fin du clip et reporte un dépassement fort", () => {
    const slight = scheduleBeat(beat, alignment, 1_400, () => 200);
    expect(slight.deferred).toEqual([]);
    expect(slight.timeline.map(({ action, start, end }) => [action.id, start, end])).toEqual([
      ["draw", 400, 1_400], ["accent", 1_400, 1_400],
    ]);
    const strong = scheduleBeat(beat, alignment, 1_000, () => 200);
    expect(strong.timeline).toEqual([]);
    expect(strong.deferred.map(({ action }) => action.id).sort()).toEqual(["accent", "draw"]);
  });

  it("raccourcit un geste qui déborderait de la fin du clip", () => {
    const late = Beat.parse({
      id: "late", say: "Voici la fin.", cues: [{ id: "end", text: "fin" }],
      do: [{ id: "show_end", verb: "write", target: "f", at: "cue:end" }],
    });
    const { timeline } = scheduleBeat(late, new Map([["end", { start: 900, end: 1_000 }]]), 1_000, () => 320);
    expect(timeline).toMatchObject([{ start: 900, end: 1_000 }]);
  });
});
