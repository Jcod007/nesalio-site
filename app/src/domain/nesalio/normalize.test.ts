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

  it("ne touche pas des parties qui disent une autre formule", () => {
    // A missing number is not an operator: the formula would change, the refusal stays.
    const raw = slice({
      introduces: [{ id: "eq", type: "math", content: "3^2 + 4^2 = 25", parts: [{ id: "a", text: "3^2" }, { id: "b", text: "= 25" }] }],
    });
    expect(valid(normalizeSlice(raw).slice)).toContainEqual(expect.stringContaining("bout à bout"));
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

  it("laisse intacte une tranche déjà valide", () => {
    const raw = slice({});
    expect(normalizeSlice(raw)).toEqual({ slice: raw, fixes: [] });
  });
});
