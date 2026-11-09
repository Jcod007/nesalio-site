/**
 * Quel système explique sur la page élève : Nesalio (explication au tableau,
 * format v3.3) ou l'ancien tuteur. Nesalio par défaut ; NESALIO_EXPLICATION=0
 * revient à l'ancien sans toucher au code. Sans modèle (DISABLE_AI, leçons de
 * démonstration) et pour l'inspection JSON, l'ancien système reste utilisé.
 */
import { readAiConfig } from "./config";

export type Explainer = "nesalio" | "tuteur";

export function explainerFor({ env = process.env, headers, inspection }: { env?: NodeJS.ProcessEnv; headers: Headers; inspection: boolean }): Explainer {
  if (env.NESALIO_EXPLICATION?.trim() === "0" || inspection) return "tuteur";
  return readAiConfig(headers, env).chat ? "nesalio" : "tuteur";
}
