# Banc Nesalio — ap-allegees-reprise

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 1 · questions : 15 · leçons : 15 · lancé le 2026-11-09T21:29:39.369Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **14/15 (93.3 %)** |
| — dont chimie | 14/15 (93.3 %) |
| Issues | complète : 14 ; erreur incomplete : 1 |
| 1re tranche (médiane / max) | 5.0 s / 16.9 s |
| Durée totale (médiane / max) | 51.9 s / 120.7 s |
| Refus (corrections demandées) | 9 |
| Réparations sans appel | 24 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 24 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 268781, sortie 34494 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (15 questions × 1 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 8
- clé inconnue : 1
- leçon : erreur incomplete : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-acide-base-sel#1 | chimie | complète | oui | 4 | 16.9 s | 120.7 s | 2 | 3 | — | 0 | chimie_acides |
| ap-bicarbonate-vinaigre#1 | chimie | complète | oui | 4 | 4.2 s | 51.9 s | 0 | 2 | — | 0 | chimie_acides, chimie_balancement |
| ap-co2-ionique#1 | chimie | complète | oui | 5 | 11.4 s | 76.5 s | 2 | 2 | — | 0 | aucun |
| ap-conductibilite-ph#1 | chimie | complète | oui | 5 | 5.0 s | 70.7 s | 0 | 2 | — | 0 | chimie_acides |
| ap-equilibrer#1 | chimie | complète | oui | 5 | 5.6 s | 16.2 s | 0 | 4 | — | 1 | chimie_balancement |
| ap-isoler-temperature#1 | chimie | complète | oui | 5 | 3.3 s | 53.7 s | 0 | 1 | — | 0 | algebre |
| ap-kps-solubilite#1 | chimie | complète | oui | 5 | 4.7 s | 56.5 s | 0 | 2 | — | 0 | chimie_equilibre, chimie_acides |
| ap-loi-hess#1 | chimie | complète | oui | 4 | 8.5 s | 19.9 s | 0 | 2 | — | 1 | chimie_energie |
| ap-masse-moles#1 | chimie | erreur incomplete | **non** | 2 | 3.6 s | 83.0 s | 3 | 0 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap-ph-log#1 | chimie | complète | oui | 6 | 3.9 s | 13.5 s | 0 | 0 | — | 1 | chimie_acides, chimie_concentration |
| ap-ppm-mol#1 | chimie | complète | oui | 4 | 9.9 s | 18.2 s | 0 | 1 | — | 0 | chimie_concentration |
| ap-reactif-limitant#1 | chimie | complète | oui | 4 | 4.6 s | 10.4 s | 0 | 2 | — | 1 | chimie_mole |
| ap-titrage-yamaska#1 | chimie | complète | oui | 3 | 9.1 s | 86.4 s | 2 | 1 | — | 1 | chimie_acides |
| ap-vitesse-ordre-2#1 | chimie | complète | oui | 4 | 4.8 s | 14.8 s | 0 | 0 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-zinc-hcl#1 | chimie | complète | oui | 4 | 12.3 s | 29.5 s | 0 | 2 | — | 3 | chimie_acides |
