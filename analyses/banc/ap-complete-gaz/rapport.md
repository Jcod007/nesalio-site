# Banc Nesalio — ap-complete-gaz

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 9 · leçons : 18 · lancé le 2026-11-09T21:42:19.417Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **12/18 (66.7 %)** |
| — dont chimie | 12/18 (66.7 %) |
| Issues | complète : 12 ; erreur upstream : 5 ; erreur incomplete : 1 |
| 1re tranche (médiane / max) | 13.7 s / 42.4 s |
| Durée totale (médiane / max) | 34.1 s / 141.1 s |
| Refus (corrections demandées) | 11 |
| Réparations sans appel | 12 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 36 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 422379, sortie 38418 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (9 questions × 2 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 10
- leçon : erreur upstream : 5
- repère absent : 2
- leçon : erreur incomplete : 1
- clé inconnue : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-gaz-ballons-helium#1 | chimie | complète | oui | 5 | 21.3 s | 29.7 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-ballons-helium#2 | chimie | erreur upstream | **non** | 0 | — | 56.2 s | 0 | 0 | — | 0 | chimie_gaz |
| ap-gaz-conversion-pression#1 | chimie | complète | oui | 4 | 19.3 s | 32.0 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-conversion-pression#2 | chimie | erreur upstream | **non** | 0 | — | 22.4 s | 0 | 0 | — | 0 | chimie_gaz |
| ap-gaz-melange-methane#1 | chimie | erreur incomplete | **non** | 2 | 7.1 s | 141.1 s | 4 | 0 | — | 0 | aucun |
| ap-gaz-melange-methane#2 | chimie | erreur upstream | **non** | 0 | — | 22.2 s | 0 | 0 | — | 0 | aucun |
| ap-gaz-moles-temperature#1 | chimie | complète | oui | 5 | 1.8 s | 17.5 s | 1 | 0 | — | 0 | chimie_mole |
| ap-gaz-moles-temperature#2 | chimie | erreur upstream | **non** | 0 | — | 22.7 s | 0 | 0 | — | 0 | chimie_mole |
| ap-gaz-pression-variations#1 | chimie | complète | oui | 5 | 42.4 s | 50.8 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-pression-variations#2 | chimie | complète | oui | 5 | 13.7 s | 34.4 s | 0 | 2 | — | 4 | chimie_gaz |
| ap-gaz-pressions-partielles#1 | chimie | complète | oui | 4 | 5.1 s | 21.7 s | 0 | 0 | — | 1 | chimie_mole |
| ap-gaz-pressions-partielles#2 | chimie | complète | oui | 5 | 1.4 s | 39.3 s | 0 | 3 | — | 0 | chimie_mole |
| ap-gaz-theorie-cinetique#1 | chimie | complète | oui | 4 | 6.0 s | 12.5 s | 0 | 0 | — | 0 | chimie_gaz |
| ap-gaz-theorie-cinetique#2 | chimie | complète | oui | 6 | 25.3 s | 92.3 s | 3 | 0 | — | 1 | chimie_gaz |
| ap-gaz-volume-so2#1 | chimie | complète | oui | 4 | 21.0 s | 33.8 s | 2 | 0 | — | 0 | geometrie |
| ap-gaz-volume-so2#2 | chimie | erreur upstream | **non** | 0 | — | 42.4 s | 0 | 0 | — | 0 | geometrie |
| ap-stoechio-moles#1 | chimie | complète | oui | 5 | 3.6 s | 75.9 s | 0 | 4 | — | 1 | chimie_mole |
| ap-stoechio-moles#2 | chimie | complète | oui | 5 | 29.3 s | 34.8 s | 1 | 0 | — | 0 | chimie_mole |
