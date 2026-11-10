import { z } from "zod";
import { AwaitEvent, Check, DiagnosisEvent, EndEvent, ErrorEvent, PlanEvent, SourceEvent } from "@/domain/tutor/dialogue";

export const NESALIO_FORMAT_VERSION = "3.3";
export const Id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const SymbolName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);
const Text = z.string().trim().min(1).max(400);
const Gap = z.enum(["xs", "sm", "md", "lg", "xl"]);
const Direction = z.enum(["up", "down", "left", "right"]);
const Align = z.enum(["left", "right", "center", "top", "bottom"]);
export const Pace = z.enum(["quick", "normal", "slow"]);
export const Pause = z.enum(["brief", "normal", "long"]);
const Bounds = z.enum(["layout_bounds", "render_bounds"]);
const Transition = z.enum(["smooth", "instant"]);
export const Role = z.enum(["neutral", "given", "unknown", "accent", "result", "secondary"]);
const Value = z.union([z.number(), z.strictObject({ symbol: SymbolName }), z.strictObject({ parameter: SymbolName })]);

const Layout = z.union([
  z.strictObject({ center_on: z.union([z.literal("initial_viewport"), Id]) }),
  z.strictObject({
    next_to: Id, direction: Direction,
    gap: Gap.optional().describe("écart avec le voisin"),
    align: Align.optional().describe("alignement le long du voisin"),
  }),
  z.strictObject({ align_to: Id, align: Align }),
  // Against what the student sees at that moment, resolved once: the object then keeps its place on the board.
  z.strictObject({
    to_edge: Direction.describe("bord de ce que voit l'élève à ce moment-là"),
    gap: Gap.optional().describe("marge avec le bord"),
  }),
  z.strictObject({
    to_corner: z.enum(["top_left", "top_right", "bottom_left", "bottom_right"]).describe("coin de ce que voit l'élève à ce moment-là"),
    gap: Gap.optional().describe("marge avec le coin"),
  }),
]);
const Attachment = z.strictObject({
  parent: Id,
  anchor: Id.describe("top, bottom, left, right, center, ou une ancre nommée de la figure parente"),
  part: Id.optional().describe("une part de la formule parente : l'étiquette va contre ce morceau"),
  placement: z.enum(["inside", "outside"]).optional().describe("outside (défaut) : à côté du parent ; inside : sur lui"),
  gap: Gap.optional().describe("écart avec le parent"),
});
const ComputedContent = z.strictObject({
  kind: z.literal("computed"),
  expression_ref: Id.describe("une expression de math_context.expressions"),
  template: Text.describe("texte affiché, où {value} est remplacé par la valeur calculée"),
  precision: z.number().int().min(0).max(12).describe("nombre de décimales"),
});
const Coordinate = z.tuple([z.number(), z.number()]);
const Interval = z.tuple([z.number(), z.number()]).refine(([min, max]) => min < max, "Intervalle non croissant.");
const Expression = z.string().min(1).max(256);
const endpoints = z.strictObject({ from: Coordinate, to: Coordinate });
// A cell is a number, or a short text (unit, "?", symbol); "" or null leaves it blank.
const MatrixCell = z.union([z.number(), z.string().trim().max(24), z.null()]);
const matrixRows = z.array(z.array(MatrixCell).min(1).max(16)).min(1).max(16)
  .refine((rows) => rows.every((row) => row.length === rows[0]?.length), "La matrice doit être rectangulaire.");
/** Table titles: a blank one is drawn as an empty cell. */
const BlankableText = z.string().trim().max(400);
const BlankableHeader = z.string().trim().max(60);
export type MatrixParams = {
  rows: readonly (readonly (number | string | null)[])[];
  row_labels?: readonly string[];
  column_labels?: readonly string[];
};

/**
 * Parts of a matrix named by the engine, for `highlight` with `part`: each data
 * cell `r{i}c{j}`, each row `r{i}` (with its title), each column `c{j}` (with its
 * header). Counted from 1, titles and headers excluded.
 */
export function matrixParts(params: MatrixParams): string[] {
  const rows = params.rows.length, columns = params.rows[0]?.length ?? 0;
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  return [
    ...range(rows).flatMap((i) => range(columns).map((j) => `r${i}c${j}`)),
    ...range(rows).map((i) => `r${i}`),
    ...range(columns).map((j) => `c${j}`),
  ];
}
const baseObject = {
  id: Id,
  // Kept for v3.3 documents, which use it; no engine rule reads it yet, so the prompt does not offer it.
  priority: z.enum(["low", "medium", "high"]).optional().describe("accepté, mais ignoré par le moteur"),
  size: z.enum(["small", "medium", "large"]).optional().describe("taille des textes et formules"),
  layout: Layout.optional().describe("place un texte ou une formule par rapport à un autre objet"),
  attachment: Attachment.optional().describe("fixe l'objet à une ancre de son parent, comme une étiquette"),
  style: z.strictObject({ role: Role }).optional().describe("rôle de style au départ"),
  frame: Id.optional().describe("figures seulement : rejoint le repère de cette figure déjà déclarée, avec les mêmes coordonnées mathématiques"),
};

/**
 * Objects drawn in mathematical coordinates. The figures of a tranche share a
 * frame that the engine places as one block on the board (spec §1, §7).
 */
export const FIGURE_TYPES: ReadonlySet<string> = new Set([
  "point", "line", "arrow", "vector", "circle", "polygon", "axes", "function_graph", "parametric_curve", "number_line", "triangle_right",
]);
/** Named pieces of one formula, in reading order, so each can be written on its own spoken word. */
const MathParts = z.array(z.strictObject({ id: Id, text: z.string().trim().min(1).max(256) })).min(2).max(16)
  .describe("morceaux de la formule dans l'ordre de lecture, chacun écrit sur son mot");
const object = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ ...baseObject, ...shape, type: z.literal(type) });

// Payload profiles supported by validation. The catalogue also lists capabilities
// whose payloads and execution semantics still need a profile.
export const SceneObject = z.discriminatedUnion("type", [
  object("point", { params: z.strictObject({ at: Coordinate }) }),
  object("line", { params: endpoints }),
  object("arrow", { params: endpoints }),
  object("vector", { params: endpoints }),
  object("circle", { params: z.strictObject({ center: Coordinate, radius: z.number().positive() }) }),
  object("polygon", { params: z.strictObject({ vertices: z.array(Coordinate).min(3).max(64) }) }),
  object("matrix", { params: z.strictObject({
    rows: matrixRows,
    // An empty title is a blank cell (the corner, a row without a title): refused, it stopped lessons on the
    // Alloprof bench in forms the repair of normalize.ts did not cover. A list all blank or empty is removed there.
    row_labels: z.array(BlankableText).min(1).max(16).optional()
      .describe("intitulé de chaque ligne (ex. « durée (h) ») : la matrice devient un tableau de valeurs quadrillé, intitulés en première colonne"),
    column_labels: z.array(BlankableHeader).min(1).max(17).optional()
      .describe("en-tête de chaque colonne (ex. « H », « O », « H₂O ») ; avec row_labels, un de plus possible en tête pour la colonne des intitulés"),
  })
    .refine((params) => !params.row_labels || params.row_labels.length === params.rows.length, "Un intitulé par ligne du tableau.")
    .refine((params) => {
      const labels = params.column_labels?.length, columns = params.rows[0]?.length ?? 0;
      return labels === undefined || labels === columns || (params.row_labels !== undefined && labels === columns + 1);
    }, "Un en-tête par colonne du tableau (un de plus seulement pour la colonne des intitulés de lignes).") }),
  object("number_line", { params: z.strictObject({ domain: Interval }) }),
  object("text", { content: Text }),
  object("label", { content: Text }),
  object("callout", { content: Text }),
  object("math", { content: z.union([Text, ComputedContent]), parts: MathParts.optional() }),
  object("axes", { params: z.strictObject({ x: Interval, y: Interval }).optional().describe("intervalles des axes ; défaut x de -6 à 6, y de -4 à 4") }),
  object("function_graph", { params: z.strictObject({ expression: Expression, domain: Interval.optional().describe("intervalle de x tracé") }) }),
  object("parametric_curve", { params: z.strictObject({ x: Expression, y: Expression, domain: Interval }) }),
  object("triangle_right", { params: z.strictObject({ leg_a: Value, leg_b: Value }) }),
]);
export type SceneObject = z.infer<typeof SceneObject>;

export const Group = z.strictObject({
  id: Id,
  items: z.array(Id).min(1).max(64),
  arrange: z.strictObject({ direction: Direction, align: Align.optional(), gap: Gap.optional() }).optional(),
  layout: Layout.optional(),
});
export type Group = z.infer<typeof Group>;

const AnchorTime = z.string().regex(/^(?:beat:start|cue(?:_end)?:[a-zA-Z][a-zA-Z0-9_-]{0,63})$/);
const Trigger = z.union([AnchorTime, z.string().regex(/^after:[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)]);
const action = <T extends string, S extends z.ZodRawShape>(verb: T, shape: S) =>
  z.strictObject({
    id: Id,
    verb: z.literal(verb),
    at: Trigger.optional(),
    pace: Pace.optional(),
    start: AnchorTime.optional(),
    end: AnchorTime.optional(),
    ...shape,
  });
const targets = z.array(Id).min(1).max(64);
export const Action = z.discriminatedUnion("verb", [
  action("show", { target: Id, stagger: Pace.optional().describe("fait apparaître les membres d'un groupe l'un après l'autre") }),
  action("draw", { target: Id }),
  action("write", { target: Id, part: Id.optional().describe("écrit seulement cette partie de la formule") }),
  action("highlight", {
    target: Id,
    role: Role.optional().describe("couleur sémantique du surlignage passager ; défaut accent"),
    part: Id.optional().describe("surligne seulement cette partie de la formule (le x, un membre) au lieu de toute la formule"),
  }),
  action("set_style", { target: Id, role: Role }),
  // Clearing the board: what the lesson no longer talks about steps back or leaves (with its labels).
  action("dim", { target: Id.describe("estompe : l'objet reste visible en retrait, avec ses étiquettes ; show le ramène au premier plan") }),
  action("fade_out", { target: Id.describe("fait disparaître en fondu, avec ses étiquettes, et libère sa place ; show le fait revenir") }),
  action("remove", { target: Id.describe("efface en fondu, avec ses étiquettes, et libère sa place ; l'objet ne peut plus être visé ensuite") }),
  action("move", {
    target: Id.describe("objet déjà au tableau ; ses étiquettes le suivent, des axes emportent leurs courbes et points"),
    to: Layout.describe("nouvelle place, comme layout : next_to, align_to, center_on, to_edge, to_corner"),
  }),
  action("transform", {
    source: Id.describe("formule déjà au tableau"),
    target: Id.describe("formule déclarée, encore invisible : elle prend la place de la source ; les morceaux communs glissent, le reste apparaît ou s'efface"),
  }),
  action("camera.focus", {
    targets,
    bounds: Bounds.optional().describe("render_bounds (défaut) : ce qui est visible ; layout_bounds : aussi ce qui va apparaître"),
    transition: Transition.optional().describe("smooth (défaut) ou instant"),
    save_as: Id.optional().describe("nom unique de ce cadrage dans la leçon, pour y revenir avec camera.restore"),
  }),
  action("camera.restore", {
    frame: Id.describe("nom d'un cadrage déjà mémorisé par camera.focus avec save_as"),
    transition: Transition.optional().describe("smooth (défaut) ou instant"),
  }),
  action("layout.reflow", { targets, intent: Text }),
  action("animate_parameter", {
    parameter: SymbolName, from: z.number(), to: z.number(),
    easing: z.enum(["smooth", "linear"]).optional().describe("smooth (défaut) : départ et arrivée en douceur"),
  }),
]).refine((value) => value.at !== undefined
  ? value.start === undefined && value.end === undefined
  : value.start !== undefined && value.end !== undefined && value.pace === undefined,
{ message: "Utilise at ou un intervalle start/end." });
export type Action = z.infer<typeof Action>;

export const Cue = z.strictObject({ id: Id, text: Text, occurrence: z.number().int().min(1).max(400).optional() });
export const Beat = z.strictObject({
  id: Id, say: Text, cues: z.array(Cue).max(32), do: z.array(Action).max(64), pause_after: Pause.optional(),
});
export type Beat = z.infer<typeof Beat>;
export const Slice = z.strictObject({
  // A tranche that only works on objects already on the board introduces nothing: the list may be left out.
  slice_id: Id, introduces: z.array(SceneObject).max(64).default([]).describe("nouveaux objets de la tranche ; [] si elle n'en introduit pas"), groups: z.array(Group).max(32).optional(),
  beats: z.array(Beat).min(1).max(32),
});
export type Slice = z.infer<typeof Slice>;

export const SymbolDefinition = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("constant"), value: z.number() }),
  z.strictObject({ kind: z.literal("parameter"), initial: z.number(), min: z.number(), max: z.number() }),
]);
export const MathContext = z.strictObject({
  symbols: z.record(SymbolName, SymbolDefinition),
  expressions: z.record(Id, Expression),
});
export type MathContext = z.infer<typeof MathContext>;
export const LessonMetadata = z.strictObject({ id: Id, title: Text, language: z.string().min(2).max(35), learning_goal: Text });
export const ModelOutput = z.strictObject({
  lesson: LessonMetadata.optional(),
  math_context: MathContext.optional(),
  slices: z.array(Slice).min(1),
});

export const RuntimeState = z.strictObject({
  current_slice: Id.nullable(),
  current_beat: Id.nullable(),
  visible_objects: z.array(Id),
  objects: z.array(z.strictObject({
    id: Id, type: z.string().min(1), visible: z.boolean(),
    /** Present only while a formula is partly written. */
    visible_parts: z.array(Id).optional(),
  })).optional(),
  groups: z.array(z.strictObject({ id: Id, items: z.array(Id) })).optional(),
  camera: z.strictObject({
    state: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number().positive() }),
    is_animating: z.boolean(),
    /** Where a transition in progress is heading; null at rest. */
    target_state: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number().positive() }).nullable().optional(),
  }),
  parameters: z.record(SymbolName, z.number()).optional(),
});
export type RuntimeState = z.infer<typeof RuntimeState>;

export const ExecutionEvent = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("lesson"), lesson: LessonMetadata, math_context: MathContext.optional() }),
  z.strictObject({ kind: z.literal("slice"), slice: Slice }),
  z.strictObject({ kind: z.literal("question"), id: Id, check: Check }),
  PlanEvent, DiagnosisEvent, SourceEvent, AwaitEvent, EndEvent, ErrorEvent,
]);
