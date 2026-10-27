/**
 * Contrôles conservateurs avant diffusion : seuls les cas dont l'erreur est
 * certaine sont rejetés. Ne prétend pas prouver un raisonnement général.
 */
import type { Step } from "@/domain/scene/schema";

export interface QualityState {
  readonly ids: Set<string>;
  readonly groups?: ReadonlyMap<string, ReadonlySet<string>>;
}
export interface QualityResult {
  ok: boolean;
  reason?: string;
  next: QualityState;
}
const TARGET_COMMANDS = new Set(["move", "copy", "rotate", "transform", "highlight", "dim", "undim", "erase", "focus", "applyMatrix"]);
const SIMPLE_EQUALITY = /(?:^|[\s:;,(])(-?\d+(?:\.\d+)?)\s*([+*×÷/−-])\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)(?=$|[\s.,;!?])/g;

/** Vérifie uniquement les égalités arithmétiques explicites, sans variables ni unités. */
export function arithmeticError(say: string): string | undefined {
  for (const match of say.matchAll(SIMPLE_EQUALITY)) {
    const [, lhs, operator, rhs, result] = match;
    const a = Number(lhs), b = Number(rhs), c = Number(result);
    const expected = operator === "+" ? a + b : operator === "*" || operator === "×" ? a * b
      : operator === "−" || operator === "-" ? a - b : b === 0 ? NaN : a / b;
    if (!Number.isFinite(expected) || Math.abs(expected - c) > 1e-8 * Math.max(1, Math.abs(expected))) {
      return "Égalité arithmétique incorrecte";
    }
  }
}

/** Validation transactionnelle : ne modifie jamais l'état du tableau si une action échoue. */
export function validateStep(step: Step, state: QualityState): QualityResult {
  const mathError = arithmeticError(step.say);
  if (mathError) return { ok: false, reason: mathError, next: state };
  const ids = new Set(state.ids);
  const groups = new Map<string, Set<string>>(
    [...(state.groups ?? new Map())].map(([id, members]) => [id, new Set(members)]),
  );
  const exists = (id: string): boolean => ids.has(id) || (groups.get(id)?.size ?? 0) > 0;
  const reject = (reason: string): QualityResult => ({ ok: false, reason, next: state });
  for (const action of step.do) {
    if ("target" in action && typeof action.target === "string" && TARGET_COMMANDS.has(action.type) && !exists(action.target)) {
      return reject(`Cible absente du tableau : ${action.target}`);
    }
    if ("near" in action && typeof action.near === "string" && !exists(action.near)) {
      return reject(`Repère near absent du tableau : ${action.near}`);
    }
    if ("onto" in action && typeof action.onto === "string" && !exists(action.onto)) {
      return reject(`Repère onto absent du tableau : ${action.onto}`);
    }
    if (action.type === "group") {
      if (ids.has(action.id) || groups.has(action.id)) return reject(`Identifiant de groupe déjà utilisé : ${action.id}`);
      const members = action.members.filter(exists);
      if (members.length !== action.members.length) return reject("Un membre du groupe est absent du tableau");
      groups.set(action.id, new Set(members));
      continue;
    }
    if (action.type === "erase") {
      const groupMembers = groups.get(action.target);
      if (groupMembers) for (const member of groupMembers) ids.delete(member);
      else ids.delete(action.target);
      for (const [name, members] of groups) {
        for (const member of members) if (!ids.has(member)) members.delete(member);
        if (members.size === 0) groups.delete(name);
      }
      continue;
    }
    if (action.type === "clear") {
      ids.clear();
      groups.clear();
      continue;
    }
    if ("id" in action && typeof action.id === "string") {
      if (exists(action.id)) return reject(`Identifiant déjà utilisé : ${action.id}`);
      ids.add(action.id);
    }
  }
  return { ok: true, next: { ids, groups } };
}
