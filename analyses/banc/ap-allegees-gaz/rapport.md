# Banc Nesalio — ap-allegees-gaz

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 9 · leçons : 18 · lancé le 2026-11-09T21:43:12.819Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **13/18 (72.2 %)** |
| — dont chimie | 13/18 (72.2 %) |
| Issues | complète : 13 ; erreur upstream : 5 |
| 1re tranche (médiane / max) | 14.5 s / 35.1 s |
| Durée totale (médiane / max) | 40.4 s / 104.1 s |
| Refus (corrections demandées) | 16 |
| Réparations sans appel | 13 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 44 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 491333, sortie 38553 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (9 questions × 2 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 13
- leçon : erreur upstream : 5
- clé inconnue : 2
- repère absent : 2
- type ou champ manquant : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-gaz-ballons-helium#1 | chimie | complète | oui | 5 | 7.8 s | 39.8 s | 2 | 0 | — | 0 | chimie_gaz |
| ap-gaz-ballons-helium#2 | chimie | complète | oui | 4 | 35.1 s | 103.2 s | 2 | 0 | — | 0 | chimie_gaz |
| ap-gaz-conversion-pression#1 | chimie | complète | oui | 6 | 14.1 s | 55.7 s | 1 | 1 | — | 1 | chimie_gaz |
| ap-gaz-conversion-pression#2 | chimie | complète | oui | 5 | 17.2 s | 58.4 s | 1 | 1 | — | 0 | chimie_gaz |
| ap-gaz-melange-methane#1 | chimie | complète | oui | 4 | 6.8 s | 17.8 s | 0 | 1 | — | 1 | aucun |
| ap-gaz-melange-methane#2 | chimie | complète | oui | 5 | 28.3 s | 71.5 s | 1 | 1 | — | 0 | aucun |
| ap-gaz-moles-temperature#1 | chimie | erreur upstream | **non** | 2 | 18.9 s | 104.1 s | 2 | 0 | — | 0 | chimie_mole |
| ap-gaz-moles-temperature#2 | chimie | complète | oui | 4 | 14.8 s | 22.8 s | 1 | 1 | — | 0 | chimie_mole |
| ap-gaz-pression-variations#1 | chimie | complète | oui | 5 | 11.3 s | 23.7 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-pression-variations#2 | chimie | erreur upstream | **non** | 0 | — | 21.3 s | 0 | 0 | — | 0 | chimie_gaz |
| ap-gaz-pressions-partielles#1 | chimie | complète | oui | 4 | 11.1 s | 18.9 s | 0 | 1 | — | 1 | chimie_mole |
| ap-gaz-pressions-partielles#2 | chimie | erreur upstream | **non** | 0 | — | 23.9 s | 0 | 0 | — | 0 | chimie_mole |
| ap-gaz-theorie-cinetique#1 | chimie | erreur upstream | **non** | 3 | 2.8 s | 100.8 s | 2 | 0 | — | 0 | chimie_gaz |
| ap-gaz-theorie-cinetique#2 | chimie | complète | oui | 5 | 16.1 s | 19.4 s | 1 | 0 | — | 0 | chimie_gaz |
| ap-gaz-volume-so2#1 | chimie | complète | oui | 4 | 6.0 s | 10.5 s | 0 | 4 | — | 0 | geometrie |
| ap-gaz-volume-so2#2 | chimie | complète | oui | 5 | 28.6 s | 91.6 s | 2 | 0 | — | 0 | geometrie |
| ap-stoechio-moles#1 | chimie | erreur upstream | **non** | 2 | 3.0 s | 60.5 s | 1 | 2 | — | 0 | chimie_mole |
| ap-stoechio-moles#2 | chimie | complète | oui | 5 | 24.4 s | 41.0 s | 0 | 0 | — | 0 | chimie_mole |
