/**
 * Contrôles conservateurs avant diffusion : seuls les cas dont l'erreur est
 * certaine sont rejetés. Ne prétend pas prouver un raisonnement général.
 */
import type { Step } from "@/domain/scene/schema";

export interface QualityState {
  readonly ids: Set<string>;
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

export function validateStep(step: Step, state: QualityState): QualityResult {
  const mathError = arithmeticError(step.say);
  if (mathError) return { ok: false, reason: mathError, next: state };
  const ids = new Set(state.ids);
  for (const action of step.do) {
    if ("target" in action && typeof action.target === "string" && TARGET_COMMANDS.has(action.type) && !ids.has(action.target)) {
      return { ok: false, reason: `Cible absente du tableau : ${action.target}`, next: state };
    }
    if ("id" in action && typeof action.id === "string") ids.add(action.id);
    if (action.type === "clear") ids.clear();
  }
  return { ok: true, next: { ids } };
}
