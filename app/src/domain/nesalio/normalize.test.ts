import { describe, expect, it } from "vitest";
import { escapeLatex, normalizeMathContext, normalizeSlice } from "./normalize";
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

  it("rend sa barre oblique à une commande LaTeX lue comme un caractère de contrôle dans une formule", () => {
    // `\frac` written with one backslash in the JSON is valid: a form feed followed by « rac », which trimming then drops.
    const raw = slice({ introduces: [{ id: "eq", type: "math", content: JSON.parse(String.raw`"x = \frac{1}{2} \times 4"`),
      parts: [{ id: "a", text: JSON.parse(String.raw`"x = \frac{1}{2}"`) }, { id: "b", text: JSON.parse(String.raw`"\times 4"`) }] }] });
    const { slice: fixed, fixes } = normalizeSlice(raw);
    const item = (fixed as { introduces: { content: string; parts: { text: string }[] }[] }).introduces[0]!;
    expect(item.content).toBe(String.raw`x = \frac{1}{2} \times 4`);
    expect(item.parts.map((part) => part.text)).toEqual([String.raw`x = \frac{1}{2}`, String.raw`\times 4`]);
    expect(fixes).toContainEqual(expect.stringContaining("barre oblique"));
    // A line break is restored only before a command it can stand for: a system written on two lines stays as it is.
    const lines = (content: string) => (normalizeSlice(slice({ introduces: [{ id: "eq", type: "math", content }] })).slice as { introduces: { content: string }[] }).introduces[0]!.content;
    expect(lines("2x+y=5\nx-y=1")).toBe("2x+y=5\nx-y=1");
    expect(lines("a \neq b \nabla f")).toBe(String.raw`a \neq b \nabla f`);
    // Only formulas: a line break in a sentence stays a line break.
    const text = slice({ introduces: [{ id: "t", type: "text", content: "Ligne un\nligne deux" }], do: [] });
    expect(normalizeSlice(text).fixes).toEqual([]);
  });
});

/** The validation state after a first tranche, for the repairs that need the tranches before. */
function stateAfter(first: unknown, mathContext?: unknown) {
  const result = validateModelOutput({ ...(mathContext ? { math_context: mathContext } : {}), slices: [first] });
  if (!result.ok) throw new Error(`tranche de départ invalide : ${JSON.stringify(result.issues)}`);
  return result.state;
}
const validAfter = (state: ReturnType<typeof stateAfter>, next: unknown) => {
  const result = validateModelOutput({ slices: [next] }, state);
  return result.ok ? [] : result.issues.map(({ path, message }) => `${path.join(".")} : ${message}`);
};

describe("réparations sans appel du cycle 2 (refus du banc DeepSeek)", () => {
  it("lit une clé after comme at: after:<id>", () => {
    // calorimetrie#1 : « do.1 : Unrecognized key: "after" ».
    const raw = slice({ do: [
      { id: "w", verb: "write", target: "eq", at: "cue:c_isoler" },
      { id: "h", verb: "highlight", target: "eq", role: "accent", after: "w" },
      { id: "h2", verb: "highlight", target: "eq", role: "result", after: "after:h" },
    ] });
    expect(valid(raw)).toContainEqual(expect.stringContaining('Unrecognized key: "after"'));
    const { slice: fixed, fixes } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do.slice(1)).toEqual([
      { id: "h", verb: "highlight", target: "eq", role: "accent", at: "after:w" },
      { id: "h2", verb: "highlight", target: "eq", role: "result", at: "after:h" },
    ]);
    expect(fixes).toHaveLength(2);
  });

  it("lit target_id comme target", () => {
    // zeros#2 : « beats.0.do.2 : Unrecognized key: "target_id" ».
    const raw = slice({ do: [{ id: "w", verb: "write", target_id: "eq", at: "cue:c_isoler" }] });
    expect(valid(raw)).toContainEqual(expect.stringContaining('Unrecognized key: "target_id"'));
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do[0]).toEqual({ id: "w", verb: "write", target: "eq", at: "cue:c_isoler" });
  });

  it("écrit at un intervalle dont une borne attend une action", () => {
    // exponentielle#1 : « beats.2.do.3.start : Invalid string: must match pattern ».
    const raw = slice({ do: [
      { id: "w", verb: "write", target: "eq", at: "cue:c_isoler" },
      { id: "h", verb: "highlight", target: "eq", role: "accent", start: "after:w", end: "cue_end:c_douze" },
      { id: "h2", verb: "highlight", target: "eq", role: "result", end: "after:h" },
    ] });
    expect(valid(raw)).toContainEqual(expect.stringContaining("start : Invalid string"));
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do.slice(1)).toMatchObject([{ at: "after:w" }, { at: "after:h" }]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do[1]).not.toHaveProperty("end");
    // A start on a cue with an end waiting for an action: which moment was meant is not certain, the refusal stays.
    const doubt = slice({ do: [
      { id: "w", verb: "write", target: "eq", at: "cue:c_isoler" },
      { id: "h", verb: "highlight", target: "eq", start: "cue:c_isoler", end: "after:w" },
    ] });
    expect(valid(normalizeSlice(doubt).slice)).toContainEqual(expect.stringContaining("end : Invalid string"));
  });

  const table = (params: Record<string, unknown>, extra: unknown[] = []) => slice({
    introduces: [{ id: "tab", type: "matrix", params }],
    do: [{ id: "w", verb: "write", target: "tab", at: "cue:c_isoler" }, ...extra],
  });

  it("retire d'un tableau un champ à null et des en-têtes de colonnes tous vides", () => {
    // inequation#1 : « params.row_labels : Invalid input: expected array, received null » ;
    // interets#1 : « column_labels.0..3 : Too small: expected string to have >=1 characters ».
    const rows = [[1, 2], [3, 4]];
    const raw = table({ rows, row_labels: null, column_labels: ["", " "] });
    expect(valid(raw)).toContainEqual(expect.stringContaining("row_labels : Invalid input"));
    expect(valid(raw)).toContainEqual(expect.stringContaining("column_labels.0 : Too small"));
    const { slice: fixed, fixes } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as { introduces: { params: unknown }[] }).introduces[0]!.params).toEqual({ rows });
    expect(fixes).toHaveLength(2);
  });

  it("retire l'en-tête vide du coin quand il y a un en-tête de plus pour les intitulés de lignes", () => {
    const rows = [[1, 2], [3, 4]];
    const raw = table({ rows, row_labels: ["P (kPa)", "V (L)"], column_labels: ["", "état 1", "état 2"] });
    expect(valid(raw)).toContainEqual(expect.stringContaining("column_labels.0 : Too small"));
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as { introduces: { params: { column_labels: string[] } }[] }).introduces[0]!.params.column_labels).toEqual(["état 1", "état 2"]);
    // An empty header elsewhere, or with no row titles: which header is missing is not known, the refusal stays.
    const middle = table({ rows, row_labels: ["P", "V"], column_labels: ["grandeur", "", "état 2"] });
    expect(valid(normalizeSlice(middle).slice)).not.toEqual([]);
    const noTitles = table({ rows, column_labels: ["", "état 1", "état 2"] });
    expect(valid(normalizeSlice(noTitles).slice)).not.toEqual([]);
  });

  it("écrit un tableau en entier quand write vise une de ses parts", () => {
    // stoechio#2 : « « tab » est un tableau : write l'écrit en entier, sans part ».
    const raw = slice({
      introduces: [{ id: "tab", type: "matrix", params: { rows: [[1, 2]] } }],
      do: [{ id: "w", verb: "write", target: "tab", part: "r1", at: "cue:c_isoler" }],
    });
    expect(valid(raw)).toContainEqual(expect.stringContaining("est un tableau : write"));
    const { slice: fixed } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do[0]).not.toHaveProperty("part");
    // Declared in an earlier tranche: the state knows it is a table.
    const state = stateAfter({ ...slice({ introduces: [{ id: "tab", type: "matrix", params: { rows: [[1, 2]] } }], do: [{ id: "s", verb: "show", target: "tab", at: "cue:c_isoler" }] }) });
    const later = { ...slice({ introduces: [], do: [{ id: "w", verb: "write", target: "tab", part: "c1", at: "cue:c_isoler" }] }), slice_id: "s2" };
    expect(validAfter(state, normalizeSlice(later, state).slice)).toEqual([]);
  });

  it("écrit d'un coup une valeur calculée découpée en parties", () => {
    // interets#1 : « introduces.1.parts : Les parties exigent une formule fixe, pas une valeur calculée. »
    const math = { symbols: { c: { kind: "constant", value: 1000 } }, expressions: { capital: "c*1.05" } };
    const raw = slice({
      introduces: [{ id: "res", type: "math", content: { kind: "computed", expression_ref: "capital", template: "C = {value}", precision: 2 },
        parts: [{ id: "a", text: "C =" }, { id: "b", text: "{value}" }] }],
      do: [
        { id: "w1", verb: "write", target: "res", part: "a", at: "cue:c_isoler" },
        { id: "w2", verb: "write", target: "res", part: "b", at: "cue:c_douze" },
      ],
    });
    const check = (value: unknown) => {
      const result = validateModelOutput({ math_context: math, slices: [value] });
      return result.ok ? [] : result.issues.map(({ message }) => message);
    };
    expect(check(raw)).toContainEqual(expect.stringContaining("pas une valeur calculée"));
    const { slice: fixed, fixes } = normalizeSlice(raw);
    expect(check(fixed)).toEqual([]);
    expect((fixed as { introduces: unknown[] }).introduces[0]).not.toHaveProperty("parts");
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do).toEqual([
      { id: "w1", verb: "write", target: "res", at: "cue:c_isoler" },
      { id: "w2", verb: "highlight", target: "res", role: "accent", at: "cue:c_douze" },
    ]);
    expect(fixes.join()).toContain("valeur calculée");
  });

  it("renomme un objet redéclaré d'une tranche précédente, avec ses références, sauf celles qui visent l'ancien", () => {
    // exponentielle#1 : « introduces.1.id : Identifiant déjà utilisé « eq2 » » (eq2 vient de s_division).
    const state = stateAfter({
      slice_id: "s_division", introduces: [{ id: "eq2", type: "math", content: "2^5 = 32" }, { id: "eq2_2", type: "math", content: "2^4 = 16" }],
      beats: [{ id: "b1", say: "On divise.", cues: [], do: [{ id: "w", verb: "write", target: "eq2", at: "beat:start" }] }],
    });
    const raw = {
      slice_id: "s_puissance",
      introduces: [
        { id: "eq2", type: "math", content: "2^x = 16" },
        { id: "note", type: "text", content: "puissance", layout: { next_to: "eq2", direction: "down" } },
      ],
      groups: [{ id: "g", items: ["eq2", "note"] }],
      beats: [{ id: "b1", say: "On cherche la puissance.", cues: [], do: [
        { id: "d", verb: "dim", target: "eq2", at: "beat:start" },
        { id: "w", verb: "write", target: "eq2", at: "after:d" },
        { id: "s", verb: "show", target: "note", at: "after:w" },
        { id: "h", verb: "highlight", target: "eq2", role: "accent", at: "after:s" },
        { id: "f", verb: "fade_out", target: "eq2", at: "after:h" },
        { id: "c", verb: "camera.focus", targets: ["eq2", "note"], at: "after:f" },
      ] }],
    };
    expect(validAfter(state, raw)).toContainEqual(expect.stringContaining("Identifiant déjà utilisé « eq2 »"));
    const { slice: fixed, fixes } = normalizeSlice(raw, state);
    expect(validAfter(state, fixed)).toEqual([]);
    const typed = fixed as typeof raw;
    // eq2_2 is taken too: the next free name.
    expect(typed.introduces.map(({ id }) => id)).toEqual(["eq2_3", "note"]);
    expect(typed.introduces[1]!.layout).toEqual({ next_to: "eq2_3", direction: "down" });
    expect(typed.groups[0]!.items).toEqual(["eq2_3", "note"]);
    expect(typed.beats[0]!.do.map((action) => ("target" in action ? action.target : action.targets))).toEqual(
      ["eq2", "eq2_3", "note", "eq2_3", "eq2_3", ["eq2_3", "note"]]);
    expect(fixes).toContainEqual(expect.stringContaining("« eq2 » déjà déclaré"));
    // The source of a transform is always the old formula.
    const morph = { slice_id: "s3", introduces: [{ id: "eq2", type: "math", content: "x = 4" }],
      beats: [{ id: "b1", say: "Donc.", cues: [], do: [{ id: "t", verb: "transform", source: "eq2", target: "eq2", at: "beat:start" }] }] };
    const morphed = normalizeSlice(morph, state).slice as typeof morph;
    expect(morphed.beats[0]!.do[0]).toMatchObject({ source: "eq2", target: "eq2_3" });
    expect(validAfter(state, morphed)).toEqual([]);
    // Relecteur: written after the write in the array, a fade_out at beat:start still comes first in time: the old one.
    const late = { slice_id: "s4", introduces: [{ id: "eq2", type: "math", content: "x = 4" }],
      beats: [{ id: "b1", say: "On cherche la puissance.", cues: [{ id: "c", text: "puissance" }], do: [
        { id: "w", verb: "write", target: "eq2", at: "cue:c" },
        { id: "f", verb: "fade_out", target: "eq2", at: "beat:start" },
      ] }] };
    const timed = normalizeSlice(late, state).slice as typeof late;
    expect(timed.beats[0]!.do.map(({ target }) => target)).toEqual(["eq2_3", "eq2"]);
    expect(validAfter(state, timed)).toEqual([]);
  });

  it("retire un retour à un cadrage jamais sauvegardé", () => {
    // zeros#2 : « do.2.frame : Cadrage non sauvegardé « vue_sommet » ».
    const raw = slice({ do: [
      { id: "w", verb: "write", target: "eq", at: "cue:c_isoler" },
      { id: "r", verb: "camera.restore", frame: "vue_sommet", at: "cue:c_douze" },
    ] });
    expect(valid(raw)).toContainEqual(expect.stringContaining("Cadrage non sauvegardé « vue_sommet »"));
    const { slice: fixed, fixes } = normalizeSlice(raw);
    expect(valid(fixed)).toEqual([]);
    expect((fixed as ReturnType<typeof slice>).beats[0]!.do).toEqual([{ id: "w", verb: "write", target: "eq", at: "cue:c_isoler" }]);
    expect(fixes).toContainEqual(expect.stringContaining("vue_sommet"));
    // Saved in this tranche or before: kept.
    const kept = slice({ do: [
      { id: "c", verb: "camera.focus", targets: ["eq"], save_as: "vue", at: "cue:c_isoler" },
      { id: "r", verb: "camera.restore", frame: "vue", at: "cue:c_douze" },
    ] });
    expect(normalizeSlice(kept).fixes).toEqual([]);
    // Another gesture waits for it: removing it would break that one, the refusal stays.
    const awaited = slice({ do: [
      { id: "r", verb: "camera.restore", frame: "vue_sommet", at: "cue:c_isoler" },
      { id: "w", verb: "write", target: "eq", at: "after:r" },
    ] });
    expect(valid(normalizeSlice(awaited).slice)).toContainEqual(expect.stringContaining("Cadrage non sauvegardé"));
  });

  it("place par rapport à la formule qui a remplacé, par transform, celle visée", () => {
    // « « cas1 » a été remplacée par transform : place-toi par rapport à « cas1c » ».
    const state = stateAfter({
      slice_id: "s1", introduces: [{ id: "cas1", type: "math", content: "x + 1 = 3" }, { id: "cas1c", type: "math", content: "x = 2" }],
      beats: [{ id: "b1", say: "On simplifie.", cues: [], do: [
        { id: "w", verb: "write", target: "cas1", at: "beat:start" },
        { id: "t", verb: "transform", source: "cas1", target: "cas1c", at: "after:w" },
      ] }],
    });
    const raw = { slice_id: "s2", introduces: [{ id: "n", type: "text", content: "solution", layout: { next_to: "cas1", direction: "right" } }],
      beats: [{ id: "b1", say: "Voilà.", cues: [], do: [{ id: "s", verb: "show", target: "n", at: "beat:start" }] }] };
    expect(validAfter(state, raw)).toContainEqual(expect.stringContaining("place-toi par rapport à « cas1c »"));
    const { slice: fixed } = normalizeSlice(raw, state);
    expect(validAfter(state, fixed)).toEqual([]);
    expect((fixed as typeof raw).introduces[0]!.layout).toEqual({ next_to: "cas1c", direction: "right" });
  });

  it("laisse intacte une tranche valide qui reprend des objets des tranches précédentes", () => {
    const state = stateAfter(slice({ introduces: [{ id: "eq", type: "math", content: "3x = 12" }, { id: "tab", type: "matrix", params: { rows: [[1]] } }] }));
    const later = { ...slice({ introduces: [], do: [{ id: "h", verb: "highlight", target: "tab", part: "r1c1", at: "cue:c_isoler" }, { id: "d", verb: "dim", target: "eq", at: "after:h" }] }), slice_id: "s2" };
    expect(validAfter(state, later)).toEqual([]);
    expect(normalizeSlice(later, state)).toEqual({ slice: later, fixes: [] });
  });
});

describe("barres obliques LaTeX non doublées dans une ligne JSON", () => {
  it("double une barre oblique qui ne forme pas un échappement JSON, et rien d'autre", () => {
    // `\sqrt`, `\cdot`, `\pi`, `\,` written with one backslash make the whole line unreadable.
    const line = String.raw`{"content":"x = \pm\sqrt{3} \cdot 2\,\pi \{a\}","ok":"\\frac{1}{2} \"q\" é \n"}`;
    expect(() => JSON.parse(line)).toThrow();
    expect(JSON.parse(escapeLatex(line))).toEqual({ content: String.raw`x = \pm\sqrt{3} \cdot 2\,\pi \{a\}`, ok: "\\frac{1}{2} \"q\" é \n" });
    // A valid line is never changed.
    const valid = String.raw`{"a":"\\sqrt{2} \t A"}`;
    expect(escapeLatex(valid)).toBe(valid);
    expect(escapeLatex(String.raw`{"a":"\underline{x}"}`)).toBe(String.raw`{"a":"\\underline{x}"}`);
  });
});
