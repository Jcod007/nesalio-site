/**
 * Nesalio explique sur la page élève dès qu'un modèle est configuré. L'ancien tuteur a été retiré le
 * 2026-11-10 (décision de l'utilisateur) : sans modèle (DISABLE_AI, aucun jeton), la page dit simplement que
 * Nesa n'est pas disponible.
 */
import { readAiConfig } from "./config";

export function nesalioAvailable({ env = process.env, headers }: { env?: NodeJS.ProcessEnv; headers: Headers }): boolean {
  return readAiConfig(headers, env).chat !== null;
}
