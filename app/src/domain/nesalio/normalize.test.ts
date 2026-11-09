import { describe, expect, it } from "vitest";
import { normalizeMathContext, normalizeSlice } from "./normalize";
import { validateMathContext, validateModelOutput } from "./validate";

const valid = (slice: unknown) => {
  const result = validateModelOutput({ slices: [slice] });
  return result.ok ? [] : result.issues.map(({ path, message }) => `${path.join(".")} : ${message}`);
};

/** A one-beat slice; the cases below each break it the way real generations did. */
function slice(overrides: { introduces?: unknown[]; say?: string; cues?: unknown[]; do?: unknown[] }) {
  return {
    slice_id: "s1",
    introduces: overrides.introduces ?? [{ id: "eq", type: "math", content: "3x = 12" }],
    beats: [{
      id: "b1", say: overrides.say ?? "Notre but, c'est d'isoler x, puis on trouve douze.",
      cues: overrides.cues ?? [{ id: "c_isoler", text: "isoler" }, { id: "c_douze", text: "douze" }],
      do: overrides.do ?? [{ id: "w", verb: "write", target: "eq", at: "cue:c_isoler" }],
    }],
  };
}

describe("normalisation des tranches avant validation", () => {
  it("retrouve un repère nommé sans son préfixe quand un seul repère correspond", () => {
    // Seen in real generations: cues declared as c_isoler, used as cue:isoler.
    const raw = slice({ do: [{ id: "w", verb: "write", target: "eq", start: "cue:isoler", end: "cue_end:douze" }] });
    expect(valid(raw)).not.toEqual([]);
    const { slice: fixed, fixes } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect(fixes).toHaveLength(2);
  });

  it("ne devine pas un repère ambigu ou sans rapport", () => {
    const cues = [{ id: "c_un", text: "isoler" }, { id: "d_un", text: "douze" }];
    const ambiguous = slice({ cues, do: [{ id: "w", verb: "write", target: "eq", at: "cue:un" }] });
    expect(valid(normalizeSlice(ambiguous).slice)).toContainEqual(expect.stringContaining("Repère absent"));
    const unrelated = slice({ do: [{ id: "w", verb: "write", target: "eq", at: "cue:inconnue" }] });
    expect(valid(normalizeSlice(unrelated).slice)).toContainEqual(expect.stringContaining("Repère absent"));
  });

  it("nomme dans le refus les repères du passage et les objets existants, pour que la correction vise juste", () => {
    const raw = slice({ do: [{ id: "w", verb: "write", target: "def_math", at: "cue:inconnue" }] });
    const messages = valid(raw);
    expect(messages).toContainEqual(expect.stringContaining("Repères de ce passage : c_isoler, c_douze"));
    expect(messages).toContainEqual(expect.stringContaining("Cible non déclarée « def_math » : déclare-la dans introduces de cette tranche, ou vise un objet existant (eq)"));
  });

  it("place au début du passage un geste donné sans heure", () => {
    // Seen in real recaps: the fade_out of old objects written without at.
    const raw = slice({ do: [{ id: "f", verb: "fade_out", target: "eq" }, { id: "w", verb: "write", target: "eq", at: "cue:c_douze", part: null }] });
    expect(valid(raw)).not.toEqual([]);
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do[0]).toMatchObject({ at: "beat:start" });
  });

  it("rattache aux parties les opérateurs oubliés entre elles, la formule restant celle déclarée", () => {
    // Seen in real generations: the parts give « \frac{1}{5}\frac{2}{5}= \frac{3}{5} » for the full sum.
    const fractions = slice({
      introduces: [{ id: "eq", type: "math", content: "\\frac{1}{5} + \\frac{2}{5} = \\frac{3}{5}",
        parts: [{ id: "a", text: "\\frac{1}{5}" }, { id: "b", text: "\\frac{2}{5}" }, { id: "c", text: "= \\frac{3}{5}" }] }],
    });
    const pythagore = slice({
      introduces: [{ id: "eq", type: "math", content: "3^2 + 4^2 = 9 + 16 = 25",
        parts: ["3^2", "4^2", "9", "16", "25"].map((text, i) => ({ id: `p${i}`, text })) }],
    });
    for (const raw of [fractions, pythagore]) {
      expect(valid(raw)).toContainEqual(expect.stringContaining("bout à bout"));
      const { slice: fixed } = normalizeSlice(raw);
      expect(valid(fixed)).toEqual([]);
    }
    const parts = (normalizeSlice(fractions).slice as { introduces: { parts: { text: string }[] }[] }).introduces[0]!.parts;
    expect(parts.map((part) => part.text)).toEqual(["\\frac{1}{5}", "+ \\frac{2}{5}", "= \\frac{3}{5}"]);
  });

  it("ne recolle pas des parties qui disent une autre formule : la formule déclarée est écrite entière", () => {
    // A missing number is not an operator: no part is completed with a guess; the declared formula is shown whole.
    const raw = slice({
      introduces: [{ id: "eq", type: "math", content: "3^2 + 4^2 = 25", parts: [{ id: "a", text: "3^2" }, { id: "b", text: "= 25" }] }],
    });
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as { introduces: unknown[] }).introduces[0]).toEqual({ id: "eq", type: "math", content: "3^2 + 4^2 = 25" });
  });

  it("retire une découpe en une seule partie identique à la formule", () => {
    const raw = slice({
      introduces: [{ id: "eq", type: "math", content: "3x = 12", parts: [{ id: "tout", text: "3x = 12" }] }],
      do: [{ id: "w", verb: "write", target: "eq", part: "tout", at: "cue:c_isoler" }],
    });
    expect(valid(raw)).not.toEqual([]);
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do[0]).not.toHaveProperty("part");
  });

  it("lit une heure écrite en objet et un intervalle donné à moitié", () => {
    // Seen in real generations: "at": {"cue": "c_produit"}, a draw with only start, a transform with only end.
    const raw = slice({ do: [
      { id: "w", verb: "write", target: "eq", at: { cue: "c_isoler" } },
      { id: "h", verb: "highlight", target: "eq", role: "accent", start: "cue:c_isoler" },
      { id: "f", verb: "dim", target: "eq", end: "cue_end:c_douze" },
    ] });
    expect(valid(raw)).not.toEqual([]);
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do).toMatchObject([
      { at: "cue:c_isoler" }, { at: "cue:c_isoler" }, { start: "beat:start", end: "cue_end:c_douze" },
    ]);
  });

  it("écrit en entier une formule non découpée visée avec part", () => {
    const raw = slice({ do: [{ id: "w", verb: "write", target: "eq", part: "gauche", at: "cue:c_isoler" }] });
    expect(valid(raw)).toContainEqual(expect.stringContaining("n’est pas une formule découpée"));
    expect(valid(normalizeSlice(raw).slice)).toEqual([]);
    // Declared in an earlier tranche: the state says it has no parts.
    const later = { ...slice({ introduces: [], do: [{ id: "w", verb: "write", target: "eq", part: "gauche", at: "cue:c_isoler" }] }) };
    const before = validateModelOutput({ slices: [slice({})] });
    if (!before.ok) throw new Error("tranche de départ invalide");
    const fixed = normalizeSlice(later, before.state).slice;
    expect(validateModelOutput({ slices: [{ ...fixed as object, slice_id: "s2" }] }, before.state).ok).toBe(true);
  });

  it("range un pause_after mal placé et rend lisible un identifiant accentué", () => {
    const raw = {
      ...slice({ do: [{ id: "w", verb: "write", target: "eq", at: "cue:c_isoler", pause_after: "long" }] }),
      pause_after: "normal",
    };
    raw.beats[0]!.id = "b_monté";
    expect(valid(raw)).not.toEqual([]);
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]).toMatchObject({ id: "b_monte", pause_after: "long" });
  });

  it("retire de l’en-tête une expression écrite en x, que seuls les symboles déclarés peuvent former", () => {
    // Seen in real generations: the curve's formula put in math_context.expressions.
    const math = { symbols: { a: { kind: "parameter", initial: 1, min: -2, max: 2 } }, expressions: { f: "a*x^2", g: "2*a" } };
    expect(validateMathContext(math as never)).not.toEqual([]);
    const { math: fixed, fixes } = normalizeMathContext(math);
    expect(fixed).toEqual({ symbols: math.symbols, expressions: { g: "2*a" } });
    expect(validateMathContext(fixed as never)).toEqual([]);
    expect(fixes).toHaveLength(1);
  });

  it("fait partir au début de son passage un geste qui attend une action d’un passage précédent", () => {
    // Seen in real generations: "after:w_gauche", w_gauche written in the passage before.
    const raw = {
      slice_id: "s1", introduces: [{ id: "eq", type: "math", content: "3x = 12" }, { id: "n", type: "text", content: "donc" }],
      beats: [
        { id: "b1", say: "On écrit.", cues: [], do: [{ id: "w_gauche", verb: "write", target: "eq", at: "beat:start" }] },
        { id: "b2", say: "Puis on conclut.", cues: [], do: [{ id: "s", verb: "show", target: "n", at: "after:w_gauche" }, { id: "h", verb: "highlight", target: "eq", role: "accent", at: "after:ailleurs" }] },
      ],
    };
    const fixed = normalizeSlice(raw).slice as typeof raw;
    expect(fixed.beats[1]!.do[0]).toMatchObject({ at: "beat:start" });
    // An action found nowhere before is not guessed: the refusal stays.
    expect(fixed.beats[1]!.do[1]).toMatchObject({ at: "after:ailleurs" });
  });

  it("écrit d'un coup une fraction découpée en numérateur et dénominateur, la deuxième étape la surligne", () => {
    // Seen in real generations (« C'est quoi une fraction ? », three times in a row): parts « 3 » and « 4 » for \frac{3}{4}.
    const raw = slice({
      introduces: [{ id: "eq", type: "math", content: "\\frac{3}{4}", parts: [{ id: "num", text: "3" }, { id: "den", text: "4" }] }],
      say: "Trois parts sur quatre, voilà trois quarts.",
      cues: [{ id: "c_trois", text: "Trois parts" }, { id: "c_quatre", text: "quatre" }],
      do: [
        { id: "w1", verb: "write", target: "eq", part: "num", at: "cue:c_trois" },
        { id: "w2", verb: "write", target: "eq", part: "den", at: "cue:c_quatre" },
      ],
    });
    expect(valid(raw)).toContainEqual(expect.stringContaining("bout à bout"));
    const { slice: fixed, fixes } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    const typed = fixed as { introduces: { parts?: unknown }[]; beats: { do: unknown[] }[] };
    expect(typed.introduces[0]).not.toHaveProperty("parts");
    expect(typed.beats[0]!.do).toEqual([
      { id: "w1", verb: "write", target: "eq", at: "cue:c_trois" },
      { id: "w2", verb: "highlight", target: "eq", role: "accent", at: "cue:c_quatre" },
    ]);
    expect(fixes.join()).toContain("fraction");
    // Pieces found elsewhere than as a fraction's arguments: not a fraction, the formula is still written whole.
    const other = slice({ introduces: [{ id: "eq", type: "math", content: "34 + 1", parts: [{ id: "a", text: "3" }, { id: "b", text: "4" }] }] });
    const repaired = normalizeSlice(other);
    expect(valid(repaired.slice)).toEqual([]);
    expect(repaired.fixes.join()).not.toContain("fraction");
  });

  it("écrit d'un coup une formule dont les parties ne redonnent pas la formule, les étapes suivantes la surlignent", () => {
    // Seen in real generations (dérivée, nombre dérivé): « \frac{9 - 1}{3 - 1}= 4 » as parts of « p = \frac{9 - 1}{3 - 1} = \frac{8}{2} = 4 ».
    const raw = slice({
      introduces: [{ id: "eq", type: "math", content: "p = \\frac{9 - 1}{3 - 1} = \\frac{8}{2} = 4",
        parts: [{ id: "a", text: "\\frac{9 - 1}{3 - 1}" }, { id: "b", text: "= 4" }] }],
      do: [
        { id: "w1", verb: "write", target: "eq", part: "a", at: "cue:c_isoler" },
        { id: "w2", verb: "write", target: "eq", part: "b", at: "cue:c_douze" },
        { id: "h", verb: "highlight", target: "eq", part: "b", role: "result", at: "after:w2" },
      ],
    });
    expect(valid(raw)).toContainEqual(expect.stringContaining("bout à bout"));
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    const typed = fixed as { introduces: { content: string; parts?: unknown }[]; beats: { do: unknown[] }[] };
    // The formula shown is the declared one, whole.
    expect(typed.introduces[0]).toEqual({ id: "eq", type: "math", content: "p = \\frac{9 - 1}{3 - 1} = \\frac{8}{2} = 4" });
    expect(typed.beats[0]!.do).toEqual([
      { id: "w1", verb: "write", target: "eq", at: "cue:c_isoler" },
      { id: "w2", verb: "highlight", target: "eq", role: "accent", at: "cue:c_douze" },
      { id: "h", verb: "highlight", target: "eq", role: "result", at: "after:w2" },
    ]);
  });

  it("retrouve le texte d'un repère copié avec une majuscule, un accent ou une apostrophe différente", () => {
    const raw = slice({
      say: "Quand la sécante pivote, elle s’approche de la tangente.",
      cues: [{ id: "c1", text: "la secante pivote" }, { id: "c2", text: "S'approche" }],
      do: [{ id: "w", verb: "write", target: "eq", at: "cue:c1" }, { id: "w2", verb: "highlight", target: "eq", role: "accent", at: "cue:c2" }],
    });
    expect(valid(raw)).toContainEqual(expect.stringContaining("Occurrence introuvable"));
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.cues).toEqual([{ id: "c1", text: "la sécante pivote" }, { id: "c2", text: "s’approche" }]);
  });

  it("laisse intacte une tranche déjà valide", () => {
    const raw = slice({});
    expect(normalizeSlice(raw)).toEqual({ slice: raw, fixes: [] });
  });
});
