/**
 * Consignes par domaine. Chaque domaine a son fichier, pour que les
 * améliorations d'un domaine ne touchent pas les autres.
 */
import { algebre } from "./algebre";
import { fonctions } from "./fonctions";
import { geometrie } from "./geometrie";
import { physique } from "./physique";
import type { DomainGuide } from "./types";

export const DOMAIN_GUIDES: readonly DomainGuide[] = [fonctions, algebre, geometrie, physique];

/** La section « PAR DOMAINE » de la consigne (vide tant qu'aucun domaine n'a de règle). */
export function domainSection(guides: readonly DomainGuide[] = DOMAIN_GUIDES): string {
  const filled = guides.filter((g) => g.rules.length > 0);
  if (filled.length === 0) return "";
  return ["PAR DOMAINE (applique les règles du domaine de la question)", ...filled.flatMap((g) => [`${g.title} :`, ...g.rules.map((r) => `- ${r}`)])].join("\n");
}
