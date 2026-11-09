import { compileNamedExpression } from "@/domain/math/expr";
import { cueOffset } from "./alignment";
import { negotiateCapabilities, schemaCapabilities } from "./capabilities";
import { checkCoherence, emptyCoherence, type CoherenceAlert, type CoherenceState } from "./coherence";
import { FIGURE_TYPES, matrixParts, ModelOutput, type Beat, type MathContext, type Slice } from "./contract";
import { LessonDocument } from "./lesson";

export type { CoherenceAlert, CoherenceOutcome, CoherenceRule } from "./coherence";

type Path = readonly PropertyKey[];
export interface ContractIssue {
  path: Path;
  message: string;
}

export interface ValidationState {
  readonly slices: ReadonlySet<string>;
  readonly objects: ReadonlySet<string>;
  /** Formula id → its declared part ids. */
  readonly parts: ReadonlyMap<string, ReadonlySet<string>>;
  /** Ids of declared figures, the only objects a figure can share a frame with. */
  readonly figures: ReadonlySet<string>;
  /** What leaves with an object when it is removed: a group's members, an object's attachments. */
  readonly members: ReadonlyMap<string, readonly string[]>;
  /** Objects erased by `remove` in an earlier passage: nothing may use them again. */
  readonly removed: ReadonlySet<string>;
  /** Formulas (`math`): the only objects `transform` morphs. */
  readonly formulas: ReadonlySet<string>;
  /** Formulas already produced by a `transform`: each one appears once. */
  readonly morphed: ReadonlySet<string>;
  /** Formula → the one a `transform` turned it into: a later gesture on the old name goes to the new one. */
  readonly replacedBy: ReadonlyMap<string, string>;
  readonly cameraFrames: ReadonlySet<string>;
  readonly math: MathContext;
  /** Table (matrix) id → its cells, rows and columns (r2c3, r2, c3): parts that highlight can aim at. */
  readonly tableParts?: ReadonlyMap<string, ReadonlySet<string>>;
  /** Figures and board memory of the correctness checks (coherence.ts). */
  readonly coherence?: CoherenceState;
}

const emptyState: ValidationState = {
  slices: new Set(), objects: new Set(), parts: new Map(), figures: new Set(), members: new Map(), removed: new Set(),
  formulas: new Set(), morphed: new Set(), replacedBy: new Map(), cameraFrames: new Set(),
  math: { symbols: {}, expressions: {} },
};

/** The object, and everything that goes with it (group members, attachments), recursively. */
function withMembers(id: string, members: ReadonlyMap<string, readonly string[]>): Set<string> {
  const result = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(members.get(current) ?? []));
  }
  return result;
}
type Report = (path: Path, message: string) => void;

function unique(id: string, seen: Set<string>, path: Path, report: Report): void {
  if (seen.has(id)) report(path, `Identifiant déjà utilisé « ${id} ».`);
  seen.add(id);
}

function acyclic(graph: ReadonlyMap<string, readonly string[]>, path: Path, report: Report): void {
  const active = new Set<string>();
  const finished = new Set<string>();
  function visit(id: string): void {
    if (finished.has(id)) return;
    if (active.has(id)) {
      report(path, `Dépendance cyclique autour de « ${id} ».`);
      return;
    }
    active.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    active.delete(id);
    finished.add(id);
  }
  for (const id of graph.keys()) visit(id);
}

function expression(source: string, names: ReadonlySet<string>, path: Path, report: Report): void {
  try {
    compileNamedExpression(source, names);
  } catch (error) {
    report(path, error instanceof Error ? error.message : "Expression invalide.");
  }
}

/**
 * Whether a formula piece is LaTeX that renders on its own: balanced braces,
 * \left/\right and \begin/\end, and no exponent or operator cut from its operand.
 */
const TEX_ARITY: Readonly<Record<string, number>> = {
  frac: 2, dfrac: 2, tfrac: 2, cfrac: 2, binom: 2, sqrt: 1, text: 1, mathrm: 1, mathbf: 1, operatorname: 1,
  overline: 1, underline: 1, vec: 1, hat: 1, bar: 1, boxed: 1,
};

/** Index after one argument (a braced group, a command or one character), or -1 if none. */
function skipArgument(text: string, from: number): number {
  let index = from;
  while (text[index] === " ") index++;
  if (index >= text.length || text[index] === "}") return -1;
  if (text[index] === "\\") return index + (/^\\([a-zA-Z]+|.)/.exec(text.slice(index))?.[0].length ?? 1);
  if (text[index] !== "{") return index + 1;
  for (let depth = 0; index < text.length; index++) {
    if (text[index] === "\\") index++;
    else if (text[index] === "{") depth++;
    else if (text[index] === "}" && --depth === 0) return index + 1;
  }
  return -1;
}

export function standaloneTex(text: string): boolean {
  if (/^\s*[\^_]/.test(text) || /[\\^_&]\s*$/.test(text)) return false;
  let braces = 0;
  let delimiters = 0;
  let environments = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\\") {
      const command = /^\\([a-zA-Z]+|.)/.exec(text.slice(index));
      const name = command?.[1];
      if (name === "left") delimiters++;
      if (name === "right" && --delimiters < 0) return false;
      if (name === "begin") environments++;
      if (name === "end" && --environments < 0) return false;
      let next = index + (command?.[0].length ?? 1);
      if (name === "sqrt" && text.slice(next).trimStart().startsWith("[")) next = text.indexOf("]", next) + 1 || text.length;
      // Only the presence of each argument is checked here; the main scan still balances their braces.
      for (let argument = 0; argument < (name ? TEX_ARITY[name] ?? 0 : 0); argument++) {
        next = skipArgument(text, next);
        if (next < 0) return false;
      }
      index += (command?.[0].length ?? 1) - 1;
    } else if (char === "{") braces++;
    else if (char === "}" && --braces < 0) return false;
  }
  return braces === 0 && delimiters === 0 && environments === 0;
}

/**
 * Whether two LaTeX texts write the same formula, ignoring spellings that render
 * alike: spaces, braces around one character after ^ or _ (x^{2} = x^2),
 * Unicode minus and times signs, the \left and \right delimiters.
 */
export function sameFormula(a: string, b: string): boolean {
  return normalFormula(a) === normalFormula(b);
}

/** The comparison form used by `sameFormula`: not meant to be rendered. */
export function normalFormula(text: string): string {
  return text
    .replace(/\\left|\\right/g, "")
    // Spacing commands change the look, not the formula.
    .replace(/\\(?:q?quad|[,;:!> ])/g, "")
    .replace(/\s+/g, "")
    .replace(/[−–]/g, "-")
    .replace(/×/g, "\\times")
    .replace(/([_^])\{([^{}\\])\}/g, "$1$2");
}

function checkParts(item: Extract<Slice["introduces"][number], { type: "math" }>, at: Path, report: Report): void {
  if (!item.parts) return;
  if (typeof item.content !== "string") {
    report([...at, "parts"], "Les parties exigent une formule fixe, pas une valeur calculée.");
    return;
  }
  const ids = new Set<string>();
  item.parts.forEach((part, index) => {
    unique(part.id, ids, [...at, "parts", index, "id"], report);
    if (!standaloneTex(part.text)) {
      report([...at, "parts", index, "text"], "Chaque partie doit être une formule complète (accolades équilibrées, exposant avec sa base).");
    }
  });
  const joined = item.parts.map((part) => part.text).join("");
  if (sameFormula(joined, item.content)) return;
  // Both texts in the message: the model sees exactly where they differ when it repairs the tranche.
  report([...at, "parts"], `Les parties mises bout à bout doivent redonner la formule : elles donnent « ${joined} », la formule est « ${item.content} ».`);
}

function mergeMath(
  previous: MathContext, delta: MathContext | undefined, path: Path, report: Report,
): MathContext {
  if (!delta) return previous;
  const symbols = { ...previous.symbols, ...delta.symbols };
  const expressions = { ...previous.expressions, ...delta.expressions };
  for (const [name, symbol] of Object.entries(delta.symbols)) {
    if (Object.hasOwn(previous.symbols, name)) report([...path, "symbols", name], "Symbole déjà déclaré.");
    if (symbol.kind === "parameter" && (symbol.initial < symbol.min || symbol.initial > symbol.max)) {
      report([...path, "symbols", name, "initial"], "La valeur initiale doit appartenir à l’intervalle déclaré.");
    }
  }
  const names = new Set(Object.keys(symbols));
  for (const [name, source] of Object.entries(delta.expressions)) {
    const at = [...path, "expressions", name];
    if (Object.hasOwn(previous.expressions, name)) report(at, "Expression déjà déclarée.");
    expression(source, names, at, report);
  }
  return { symbols, expressions };
}

function checkBeat(beat: Beat, state: ValidationState, written: Set<string>, removed: Set<string>, cameraFrames: Set<string>, path: Path, report: Report): void {
  const cues = new Map<string, { start: number; end: number }>();
  /** Declared objects, named in a refusal so that the repair aims at one of them. */
  const known = () => { const ids = [...state.objects].filter((id) => !removed.has(id)); return ids.length > 15 ? `${ids.slice(-15).join(", ")}…` : ids.join(", ") || "aucun"; };
  const cueIds = new Set<string>();
  beat.cues.forEach((cue, index) => {
    const at = [...path, "cues", index];
    unique(cue.id, cueIds, [...at, "id"], report);
    const start = cueOffset(beat.say, cue.text, cue.occurrence ?? 1);
    if (start < 0) report([...at, "text"], "Occurrence introuvable dans la narration : un repère doit désigner des mots entiers.");
    else cues.set(cue.id, { start, end: start + cue.text.length });
  });

  const actions = new Set<string>();
  const dependencies = new Map<string, string[]>();
  const saves = new Map<string, { id: string; start?: number }>();
  beat.do.forEach((action, index) => unique(action.id, actions, [...path, "do", index, "id"], report));
  beat.do.forEach((action, index) => {
    const at = [...path, "do", index];
    function checkTime(time: string | undefined, field: string): number | undefined {
      if (time === undefined) return;
      if (time === "beat:start") return 0;
      const [kind, ref] = time.split(":") as [string, string];
      if (kind === "after") {
        if (!actions.has(ref)) report([...at, field], `Action absente dans ce beat « ${ref} ».`);
        dependencies.set(action.id, [ref]);
        return;
      }
      const cue = cues.get(ref);
      if (!cue) report([...at, field], `Repère absent ou invalide « ${ref} ». Repères de ce passage : ${[...cueIds].join(", ") || "aucun"} (écris cue:<id> avec un de ces id).`);
      return kind === "cue_end" ? cue?.end : cue?.start;
    }
    function checkTarget(id: string, field: Path): void {
      if (!state.objects.has(id)) report([...at, ...field], `Cible non déclarée « ${id} » : déclare-la dans introduces de cette tranche, ou vise un objet existant (${known()}).`);
      // Replaced by a transform: the engine sends the gesture to the formula standing there now.
      else if (removed.has(id) && !state.replacedBy.has(id)) report([...at, ...field], `Objet effacé « ${id} » : après remove, il ne peut plus être utilisé.`);
    }
    const start = checkTime(action.at, "at") ?? checkTime(action.start, "start");
    const end = checkTime(action.end, "end");
    if (start !== undefined && end !== undefined && end <= start) {
      report([...at, "end"], "La fin doit suivre le début de l’intervalle.");
    }
    if ("target" in action) checkTarget(action.target, ["target"]);
    if ("source" in action) checkTarget(action.source, ["source"]);
    if ("targets" in action) action.targets.forEach((target, i) => checkTarget(target, ["targets", i]));
    if (action.verb === "camera.focus" && action.save_as !== undefined) {
      if (cameraFrames.has(action.save_as)) report([...at, "save_as"], `Cadrage déjà sauvegardé « ${action.save_as} ».`);
      else {
        cameraFrames.add(action.save_as);
        saves.set(action.save_as, { id: action.id, start });
      }
    }
    if (action.verb === "camera.restore") {
      if (!cameraFrames.has(action.frame)) report([...at, "frame"], `Cadrage non sauvegardé « ${action.frame} ».`);
      const save = saves.get(action.frame);
      if (save) {
        dependencies.set(action.id, [...(dependencies.get(action.id) ?? []), save.id]);
        if (save.start !== undefined && start !== undefined && start < save.start) {
          report([...at, "frame"], `Le retour précède la sauvegarde du cadrage « ${action.frame} ».`);
        }
      }
    }
    const tableParts = "target" in action ? state.tableParts?.get(action.target) : undefined;
    if (tableParts && (action.verb === "write" || action.verb === "highlight") && action.part !== undefined) {
      if (action.verb === "write") report([...at, "part"], `« ${action.target} » est un tableau : write l’écrit en entier, sans part ; highlight peut viser une case (r2c3), une ligne (r2) ou une colonne (c3).`);
      else if (!tableParts.has(action.part)) report([...at, "part"], `Case absente « ${action.part} » dans le tableau « ${action.target} » : vise r<ligne>c<colonne>, r<ligne> ou c<colonne>, comptés à partir de 1 sans les intitulés.`);
    } else if ((action.verb === "write" || action.verb === "highlight") && action.part !== undefined) {
      const parts = state.parts.get(action.target);
      if (!parts) report([...at, "part"], `« ${action.target} » n’est pas une formule découpée en parties.`);
      else if (!parts.has(action.part)) report([...at, "part"], `Partie absente « ${action.part} » dans « ${action.target} ».`);
      else {
        const key = `${action.target}#${action.part}`;
        if (action.verb === "write") {
          if (written.has(key)) report([...at, "part"], `Partie déjà écrite « ${action.part} ».`);
          written.add(key);
        }
      }
    }
    if (action.verb === "move") {
      const to = action.to;
      const reference = "next_to" in to ? to.next_to : "align_to" in to ? to.align_to
        : "center_on" in to && to.center_on !== "initial_viewport" ? to.center_on : undefined;
      if (reference !== undefined) {
        checkTarget(reference, ["to"]);
        if (reference === action.target) report([...at, "to"], "Un objet ne se place pas par rapport à lui-même.");
      }
    }
    if (action.verb === "transform") {
      for (const field of ["source", "target"] as const) {
        if (state.objects.has(action[field]) && !state.formulas.has(action[field])) {
          report([...at, field], `transform ne métamorphose que des formules (math) : « ${action[field]} » n’en est pas une.`);
        }
      }
      if (action.source === action.target) report([...at, "target"], "La source et la cible doivent être deux formules différentes.");
      else if (state.morphed.has(action.target)) report([...at, "target"], `« ${action.target} » est déjà la cible d’un transform.`);
      (state.morphed as Set<string>).add(action.target);
    }
    if (action.verb === "animate_parameter") {
      const parameter = Object.hasOwn(state.math.symbols, action.parameter) ? state.math.symbols[action.parameter] : undefined;
      if (parameter?.kind !== "parameter") report([...at, "parameter"], "Paramètre animé non déclaré.");
      else for (const field of ["from", "to"] as const) {
        if (action[field] < parameter.min || action[field] > parameter.max) {
          report([...at, field], "Valeur hors de l’intervalle du paramètre.");
        }
      }
    }
  });
  acyclic(dependencies, [...path, "do"], report);
  // Erased from the next passage on: within its own passage, timing and not order decides what comes first.
  // A formula transformed into another is replaced for good, like a removed one.
  for (const action of beat.do) {
    const gone = action.verb === "remove" ? action.target : action.verb === "transform" ? action.source : undefined;
    if (gone) for (const id of withMembers(gone, state.members)) removed.add(id);
    if (action.verb === "transform") (state.replacedBy as Map<string, string>).set(action.source, action.target);
  }
}

function checkSlices(slices: readonly Slice[], before: ValidationState, report: Report): ValidationState {
  const ids = new Set(before.slices);
  const objects = new Set(before.objects);
  const parts = new Map(before.parts);
  const figures = new Set(before.figures);
  const owned = new Map(before.members);
  const removed = new Set(before.removed);
  const written = new Set<string>();
  const formulas = new Set(before.formulas);
  const morphed = new Set(before.morphed);
  const replacedBy = new Map(before.replacedBy);
  const cameraFrames = new Set(before.cameraFrames);
  const tableParts = new Map(before.tableParts ?? []);
  const state: ValidationState = {
    slices: ids, objects, parts, figures, members: owned, removed, formulas, morphed, replacedBy, cameraFrames, math: before.math,
    tableParts, coherence: before.coherence,
  };
  const symbolNames = new Set(Object.keys(state.math.symbols));
  slices.forEach((slice, index) => {
    const path = ["slices", index];
    unique(slice.slice_id, ids, [...path, "slice_id"], report);
    slice.introduces.forEach((item, i) => unique(item.id, objects, [...path, "introduces", i, "id"], report));
    for (const item of slice.introduces) if (FIGURE_TYPES.has(item.type)) figures.add(item.id);
    for (const item of slice.introduces) if (item.type === "math") formulas.add(item.id);
    slice.groups?.forEach((group, i) => unique(group.id, objects, [...path, "groups", i, "id"], report));
    const dependencies = new Map<string, string[]>();
    function requireObject(id: string, at: Path): string {
      if (!objects.has(id)) report(at, `Objet non déclaré « ${id} ».`);
      else if (replacedBy.has(id)) {
        let now = id;
        for (let i = 0; i < 64 && replacedBy.has(now); i++) now = replacedBy.get(now)!;
        report(at, `« ${id} » a été remplacée par transform : place-toi par rapport à « ${now} ».`);
      } else if (removed.has(id)) report(at, `Objet effacé « ${id} » : après remove, il ne peut plus servir de référence.`);
      return id;
    }
    function layoutTargets(layout: Slice["introduces"][number]["layout"], at: Path): string[] {
      if (!layout || "to_edge" in layout || "to_corner" in layout) return [];
      if ("next_to" in layout) return [requireObject(layout.next_to, [...at, "next_to"])];
      if ("align_to" in layout) return [requireObject(layout.align_to, [...at, "align_to"])];
      return layout.center_on === "initial_viewport" ? [] : [requireObject(layout.center_on, [...at, "center_on"])];
    }
    slice.introduces.forEach((item, i) => {
      const at = [...path, "introduces", i];
      if (item.layout && item.attachment) report([...at, "layout"], "Un objet attaché utilise son ancre pour le placement.");
      if (item.frame !== undefined) {
        if (!FIGURE_TYPES.has(item.type)) report([...at, "frame"], "Seule une figure peut rejoindre un repère : un texte se place avec layout ou attachment.");
        else if (item.layout || item.attachment) report([...at, "frame"], "Une figure qui rejoint un repère en prend la position : pas de layout ni d’attachment en plus.");
        else if (item.frame === item.id || !figures.has(item.frame)) report([...at, "frame"], `Figure à rejoindre introuvable « ${item.frame} ».`);
        else if (removed.has(item.frame)) report([...at, "frame"], `Figure effacée « ${item.frame} » : son repère n’est plus disponible.`);
      }
      const parents = layoutTargets(item.layout, [...at, "layout"]);
      if (item.attachment) {
        parents.push(requireObject(item.attachment.parent, [...at, "attachment", "parent"]));
        owned.set(item.attachment.parent, [...owned.get(item.attachment.parent) ?? [], item.id]);
      }
      // Joining a frame is a placement dependency too: frames cannot form a cycle.
      dependencies.set(item.id, item.frame && figures.has(item.frame) && item.frame !== item.id ? [...parents, item.frame] : parents);
      if (item.type === "function_graph") {
        expression(item.params.expression, new Set([...symbolNames, "x"]), [...at, "params", "expression"], report);
      }
      if (item.type === "parametric_curve") {
        const names = new Set([...symbolNames, "t"]);
        for (const field of ["x", "y"] as const) expression(item.params[field], names, [...at, "params", field], report);
      }
      if (item.type === "math" && typeof item.content !== "string"
        && !Object.hasOwn(state.math.expressions, item.content.expression_ref)) {
        report([...at, "content", "expression_ref"], "Expression non déclarée.");
      }
      if (item.type === "matrix") tableParts.set(item.id, new Set(matrixParts(item.params)));
      if (item.type === "math" && item.parts) {
        checkParts(item, at, report);
        parts.set(item.id, new Set(item.parts.map((part) => part.id)));
      }
      if (item.type === "triangle_right") for (const leg of ["leg_a", "leg_b"] as const) {
        const value = item.params[leg];
        if (typeof value === "number") {
          if (value <= 0) report([...at, "params", leg], "La longueur doit être positive.");
          continue;
        }
        const key = "symbol" in value ? value.symbol : value.parameter;
        const symbol = Object.hasOwn(state.math.symbols, key) ? state.math.symbols[key] : undefined;
        if (!symbol || symbol.kind !== ("parameter" in value ? "parameter" : "constant")) {
          report([...at, "params", leg], "Symbole ou paramètre incompatible.");
        } else if ((symbol.kind === "constant" ? symbol.value : symbol.min) <= 0) {
          report([...at, "params", leg], "La longueur doit rester positive.");
        }
      }
    });
    slice.groups?.forEach((group, i) => {
      const at = [...path, "groups", i];
      const members = new Set<string>();
      group.items.forEach((id, j) => {
        unique(id, members, [...at, "items", j], report);
        requireObject(id, [...at, "items", j]);
      });
      dependencies.set(group.id, [...members, ...layoutTargets(group.layout, [...at, "layout"])]);
      owned.set(group.id, [...members]);
    });
    acyclic(dependencies, path, report);
    const beats = new Set<string>();
    slice.beats.forEach((beat, i) => {
      const at = [...path, "beats", i];
      unique(beat.id, beats, [...at, "id"], report);
      checkBeat(beat, state, written, removed, cameraFrames, at, report);
    });
  });
  return state;
}

/**
 * `alerts`: the correctness checks (coherence.ts). On success, the corrected ones
 * are already applied to `value` and the noted ones are kept for a repair note;
 * on failure, the refused ones are also among `issues`, with the right value.
 */
type Validation<T> =
  | { ok: true; value: T; state: ValidationState; alerts: CoherenceAlert[] }
  | { ok: false; issues: ContractIssue[]; alerts?: CoherenceAlert[] };

function checkVocabulary(input: unknown): ContractIssue[] {
  if (typeof input !== "object" || input === null || !("slices" in input) || !Array.isArray(input.slices)) return [];
  return input.slices.flatMap((slice, i) => negotiateCapabilities(slice, schemaCapabilities).map((issue) => ({
    path: ["slices", i, ...issue.path],
    message: issue.status === "unknown" ? `Capacité inconnue « ${issue.name} ».` : `Schéma de capacité indisponible pour « ${issue.name} ».`,
  })));
}

export function validateModelOutput(input: unknown, before = emptyState): Validation<ReturnType<typeof ModelOutput.parse>> {
  const vocabularyIssues = checkVocabulary(input);
  if (vocabularyIssues.length) return { ok: false, issues: vocabularyIssues };
  const parsed = ModelOutput.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  return validateSlices(parsed.data, parsed.data.math_context, ["math_context"], before);
}

/** The issues of a lesson header's math context on its own, before any tranche uses it. */
export function validateMathContext(math: MathContext): ContractIssue[] {
  const issues: ContractIssue[] = [];
  mergeMath(emptyState.math, math, ["math_context"], (path, message) => issues.push({ path, message }));
  return issues;
}

export function validateLesson(input: unknown): Validation<LessonDocument> {
  const vocabularyIssues = checkVocabulary(input);
  if (vocabularyIssues.length) return { ok: false, issues: vocabularyIssues };
  const parsed = LessonDocument.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues };
  return validateSlices(parsed.data, parsed.data.scene.math_context, ["scene", "math_context"], emptyState, "saved");
}

/**
 * `model`: a tranche the model just wrote, corrected or refused. `saved`: a lesson already assembled
 * (saved file, player): it must keep loading as it is, so every alert is only noted, nothing is changed.
 */
function validateSlices<T extends { slices: readonly Slice[] }>(
  value: T, delta: MathContext | undefined, mathPath: Path, before: ValidationState, source: "model" | "saved" = "model",
): Validation<T> {
  const issues: ContractIssue[] = [];
  const report: Report = (path, message) => issues.push({ path, message });
  const math = mergeMath(before.math, delta, mathPath, report);
  const state = checkSlices(value.slices, { ...before, math }, report);
  if (issues.length) return { ok: false, issues };
  // Correctness only on a well-formed output: every reference it reads exists.
  const coherence = checkCoherence(value.slices, state.math, before.coherence ?? emptyCoherence, before.removed);
  if (source === "saved") {
    const noted = coherence.alerts.map((alert) => ({ ...alert, outcome: "noted" as const }));
    return { ok: true, value, state: { ...state, coherence: coherence.state }, alerts: noted };
  }
  const refused = coherence.alerts.filter((alert) => alert.outcome === "refused");
  if (refused.length) return { ok: false, issues: refused.map(({ path, message }) => ({ path, message })), alerts: coherence.alerts };
  return { ok: true, value: { ...value, slices: coherence.slices }, state: { ...state, coherence: coherence.state }, alerts: coherence.alerts };
}
