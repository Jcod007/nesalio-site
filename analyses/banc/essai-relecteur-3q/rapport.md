# Banc Nesalio — essai-relecteur

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 1 · questions : 3 · leçons : 3 · lancé le 2026-11-10T00:10:19.152Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **3/3 (100.0 %)** |
| — dont chimie | 1/1 (100.0 %) |
| — dont mathematiques | 2/2 (100.0 %) |
| Issues | complète : 3 |
| 1re tranche (médiane / max) | 4.9 s / 6.9 s |
| Durée totale (médiane / max) | 19.7 s / 21.8 s |
| Refus (corrections demandées) | 2 |
| Réparations sans appel | 4 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 5 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 59495, sortie 7683 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (3 questions × 1 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 1
- cible inconnue : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-reactif-limitant#1 | chimie | complète | oui | 4 | 4.9 s | 12.2 s | 0 | 1 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap-exponentielle-bases#1 | mathematiques | complète | oui | 5 | 4.7 s | 19.7 s | 1 | 1 | — | 0 | fonctions |
| ap-perpendiculaire-point#1 | mathematiques | complète | oui | 6 | 6.9 s | 21.8 s | 1 | 2 | — | 5 | analytique, algebre |
