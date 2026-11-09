import { z } from "zod";
import vocabulary from "./nesalio_vocabulary_v3_3.json";
import { Action, SceneObject } from "./contract";

export const NESALIO_VOCABULARY = vocabulary;

const categories = new Map(vocabulary.categories.map((category) => [
  category.id, new Set(category.terms.map((term) => term.name)),
]));
const objectCategories = ["graphical_objects", "mathematical_objects"];
const actionCategories = ["visibility_and_style_verbs", "transformation_verbs", "camera_verbs", "dynamic_terms", "interaction_verbs"];

export interface Capabilities {
  readonly objects: ReadonlySet<string>;
  readonly actions: ReadonlySet<string>;
}

/** Implemented payload schemas. An executor must advertise its own capabilities separately. */
export const schemaCapabilities: Capabilities = {
  objects: new Set(["group", ...SceneObject.options.map((schema) => schema.shape.type.value)]),
  actions: new Set(Action.options.map((schema) => schema.shape.verb.value)),
};

export interface UnsupportedCapability {
  path: (string | number)[];
  name: string;
  status: "unknown" | "not-supported";
}

const CapabilityUse = z.object({
  introduces: z.array(z.object({ type: z.string() })).max(64).default([]),
  groups: z.array(z.object({})).max(32).optional(),
  beats: z.array(z.object({ do: z.array(z.object({ verb: z.string() })).max(64) })).max(32),
});

/** Check the vocabulary of a structurally readable tranche against a consumer’s declared capabilities. */
export function negotiateCapabilities(input: unknown, available: Capabilities): UnsupportedCapability[] {
  const parsed = CapabilityUse.safeParse(input);
  if (!parsed.success) return [];
  const slice = parsed.data;
  const missing: UnsupportedCapability[] = [];
  function check(name: string, offered: ReadonlySet<string>, families: string[], path: (string | number)[]): void {
    if (!families.some((family) => categories.get(family)?.has(name))) {
      missing.push({ path, name, status: "unknown" });
    } else if (!offered.has(name)) {
      missing.push({ path, name, status: "not-supported" });
    }
  }
  slice.introduces.forEach((item, i) => check(item.type, available.objects, objectCategories, ["introduces", i, "type"]));
  slice.groups?.forEach((_, i) => check("group", available.objects, objectCategories, ["groups", i]));
  slice.beats.forEach((beat, i) => beat.do.forEach((action, j) =>
    check(action.verb, available.actions, actionCategories, ["beats", i, "do", j, "verb"])));
  return missing;
}
