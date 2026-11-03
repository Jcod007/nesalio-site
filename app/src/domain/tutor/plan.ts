import { z } from "zod";

/** Contenu proposé pour une séance, sans catalogue ni identifiant réservé à une matière. */
const Concept = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  prerequisites: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
});

export const TeachingPlan = z.object({
  goal: z.string().trim().min(1).max(200),
  target: z.string().trim().min(1).max(80),
  concepts: z.array(Concept).min(1).max(16),
}).superRefine((plan, ctx) => {
  const byId = new Map(plan.concepts.map((c) => [c.id, c]));
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (byId.size !== plan.concepts.length) invalid("Identifiants de notions dupliqués");
  if (!byId.has(plan.target)) invalid("La notion visée doit appartenir au plan");
  const done = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) { invalid("Cycle dans les prérequis"); return; }
    if (done.has(id)) return;
    const concept = byId.get(id);
    if (!concept) { invalid("Prérequis absent du plan"); return; }
    visiting.add(id);
    for (const prerequisite of concept.prerequisites) visit(prerequisite);
    visiting.delete(id);
    done.add(id);
  }
  for (const id of byId.keys()) visit(id);
});
export type TeachingPlan = z.infer<typeof TeachingPlan>;
export type PlanConcept = TeachingPlan["concepts"][number];

/** Ordre des dépendances utile à l'objectif courant, indépendamment des noms de notions. */
export function planSequence(plan: TeachingPlan, target = plan.target): PlanConcept[] {
  const visited = new Set<string>();
  const result: PlanConcept[] = [];
  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const concept = plan.concepts.find((c) => c.id === id);
    if (!concept) return;
    for (const prerequisite of concept.prerequisites) visit(prerequisite);
    result.push(concept);
  }
  visit(target);
  return result;
}
