import { z } from "zod";
import { NESALIO_FORMAT_VERSION, LessonMetadata, MathContext, Pace, Pause, Role, Slice } from "./contract";
import engineShell from "./engineShell.json";

const policyStages = ["before_render", "before_and_during_render", "separate_quality_evaluation_not_automatically_proven"] as const;
const policy = (owner: string) => z.strictObject({ owner: z.literal(owner), stage: z.enum(policyStages) });

const EngineScene = z.strictObject({
  board: z.strictObject({
    type: z.literal("infinite"),
    coordinate_system: z.literal("world"),
    object_persistence: z.literal("until_explicitly_removed"),
  }),
  viewport: z.strictObject({ aspect: z.literal("auto"), safe_margin: z.enum(["xs", "sm", "md", "lg", "xl"]) }),
  layout_rules: z.strictObject({
    attachments: z.strictObject({
      graph: z.literal("acyclic"),
      position_reference: z.literal("parent_geometry"),
      position_pass: z.literal("top_down"),
      bounds_pass: z.literal("bottom_up"),
      reserve_all_declared_attachments: z.literal(true),
      declaration_rule: z.literal("declare_all_currently_planned_attachments_in_parent_slice"),
      allow_late_attachments: z.literal(true),
    }),
    bounds: z.strictObject({
      layout_bounds: z.literal("geometry_plus_all_declared_attached_descendants_including_hidden"),
      render_bounds: z.literal("visible_geometry_plus_visible_attached_descendants"),
      group_bounds: z.literal("union_of_member_bounds"),
      next_to_uses: z.literal("layout_bounds"),
      dynamic_policy: z.literal("recompute_during_parameter_change"),
    }),
    placement: z.strictObject({
      solve: z.literal("on_introduction_or_explicit_reflow"),
      preserve_resolved_world_positions: z.literal(true),
      avoid_unintended_overlap: z.literal(true),
      min_gap: z.enum(["xs", "sm", "md", "lg", "xl"]),
      on_new_object_conflict: z.array(z.enum(["try_alternative_valid_placement", "reposition_new_object", "defer_introduction", "report_unresolved"])),
      dynamic_conflict_policy: z.literal("reserve_parameter_range_or_report_unresolved"),
    }),
    late_attachment_policy: z.strictObject({
      never_reposition_existing_objects_automatically: z.literal(true),
      allow_explicit_reflow: z.literal(true),
      on_conflict: z.array(z.enum(["try_alternative_attachment_placement", "reposition_new_attachment", "use_leader_line", "report_unresolved"])),
    }),
  }),
  camera_policy: z.strictObject({
    mode: z.literal("intent_driven"),
    default_focus_bounds: z.literal("render_bounds"),
    allow_focus_on_layout_bounds_for_unrevealed_targets: z.literal(true),
    focus_padding: z.enum(["xs", "sm", "md", "lg", "xl"]),
    keep_text_readable: z.literal(true),
    default_transition: z.literal("smooth"),
    camera_coordinates_are_runtime_only: z.literal(true),
    dynamic_focus_policy: z.literal("fit_declared_parameter_range_if_available"),
  }),
  math_engine: z.strictObject({
    grammar: z.literal("restricted_math_ast_v1"),
    arbitrary_code_execution: z.literal(false),
    operators: z.tuple([z.literal("+"), z.literal("-"), z.literal("*"), z.literal("/"), z.literal("^")]),
    functions: z.tuple([z.literal("sqrt"), z.literal("abs"), z.literal("sin"), z.literal("cos"), z.literal("tan"), z.literal("exp"), z.literal("log")]),
    validation: z.strictObject({
      parse_before_render: z.literal(true),
      reject_unknown_identifiers: z.literal(true),
      reject_unsupported_functions: z.literal(true),
      check_declared_parameter_ranges: z.literal(true),
      domain_checks: z.literal("static_when_possible_and_runtime_always"),
      on_undefined: z.literal("render_gap_and_report_diagnostic"),
      on_non_finite: z.literal("render_gap_and_report_diagnostic"),
      max_ast_nodes: z.literal(64),
      max_ast_depth: z.literal(12),
      // 1e9 and 32 until 2026-11-09: lessons saved before still read.
      max_abs_constant: z.union([z.literal(1e30), z.literal(1e9)]),
      max_abs_exponent: z.union([z.literal(400), z.literal(32)]),
      max_expression_length: z.literal(256),
    }),
  }),
  validation_policy: z.strictObject({
    structural: policy("schema_validator"),
    mathematical: policy("restricted_math_engine"),
    geometry_and_timing: policy("layout_engine_and_scheduler"),
    pedagogical: policy("evaluation_pipeline"),
  }),
  semantic_styles: z.strictObject({
    roles: z.array(Role),
    theme_resolves_role_to_visual_style: z.literal(true),
    raw_colors_in_llm_commands: z.literal(false),
    color_only_meaning_forbidden: z.literal(true),
    default_role: z.literal("neutral"),
  }),
  scheduler: z.strictObject({
    clock: z.literal("audio_playhead"),
    cue_default_boundary: z.literal("start"),
    cue_end_syntax: z.literal("cue_end:<cue_id>"),
    triggers: z.tuple([z.literal("beat:start"), z.literal("cue:<cue_id>"), z.literal("cue_end:<cue_id>"), z.literal("after:<action_id>")]),
    animation_interval: z.strictObject({ start_field: z.literal("start"), end_field: z.literal("end") }),
    numeric_duration_from_llm: z.literal(false),
    pace_values: z.array(Pace),
    pause_after_values: z.array(Pause),
    stagger_values: z.array(Pace),
    independent_sequence_parallel_verbs: z.literal(false),
    on_timing_conflict: z.array(z.enum(["adapt_pace_within_limits", "add_silence_to_audio_timeline", "report_unresolved"])),
    playback_pause_behavior: z.literal("freeze_all_audio_bound_animations"),
  }),
});

const modelSections = ["lesson", "scene.math_context", "slices"] as const;
const engineSections = [
  "scene.board", "scene.viewport", "scene.layout_rules", "scene.camera_policy",
  "scene.math_engine", "scene.semantic_styles", "scene.scheduler", "scene.validation_policy",
] as const;
const sectionList = <const T extends readonly [string, ...string[]]>(entries: T) =>
  z.array(z.enum(entries)).length(entries.length).refine((values) => new Set(values).size === entries.length);

export const LessonDocument = z.strictObject({
  version: z.literal(NESALIO_FORMAT_VERSION),
  lesson: LessonMetadata,
  scene: EngineScene.extend({ math_context: MathContext }),
  slices: z.array(Slice).min(1),
  contract: z.strictObject({
    kind: z.literal("assembled_lesson_document"),
    llm_writable_sections: sectionList(modelSections),
    engine_owned_sections: sectionList(engineSections),
    vocabulary_version: z.literal(NESALIO_FORMAT_VERSION),
    vocabulary_total_terms: z.literal(80),
    vocabulary_file: z.literal("nesalio_vocabulary_v3_3.json"),
    runtime_state_is_engine_owned: z.literal(true),
    coordinates_generated_by_llm: z.literal(false),
  }),
});
export type LessonDocument = z.infer<typeof LessonDocument>;

/** Everything in a lesson document except its tranches: what the player needs before the first one arrives. */
export type LessonHeader = Omit<LessonDocument, "slices">;

/**
 * Wraps what the model may write (lesson, math_context) in the engine-owned
 * sections. The model never writes those: the server and the player add them.
 */
export function lessonHeader(lesson: z.infer<typeof LessonMetadata>, mathContext?: z.infer<typeof MathContext>): LessonHeader {
  const { slices: _, ...engine } = engineShell as unknown as LessonDocument;
  return { ...engine, lesson, scene: { ...engine.scene, math_context: mathContext ?? { symbols: {}, expressions: {} } } };
}
