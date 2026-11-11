import type { Action, Step } from "./schema";

export function isSegmented(step: Step): step is Extract<Step, { segments: unknown }> {
  return Array.isArray(step.segments);
}

export function stepText(step: Step): string {
  return isSegmented(step) ? step.segments.map((part) => part.say).join(" ") : step.say;
}

export function stepActions(step: Step): Action[] {
  return isSegmented(step) ? step.segments.flatMap((part) => part.do) : step.do;
}
