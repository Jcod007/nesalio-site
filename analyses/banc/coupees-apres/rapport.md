# Banc Nesalio — coupees-apres

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 11 · leçons : 22 · lancé le 2026-11-10T01:19:55.907Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **22/22 (100.0 %)** |
| — dont chimie | 16/16 (100.0 %) |
| — dont mathematiques | 6/6 (100.0 %) |
| Issues | complète : 22 |
| 1re tranche (médiane / max) | 4.8 s / 17.6 s |
| Durée totale (médiane / max) | 24.5 s / 45.8 s |
| Refus (corrections demandées) | 32 |
| Réparations sans appel | 17 |
| Lignes JSON illisibles | 3 |
| Appels au modèle | 54 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 675162, sortie 71293 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (11 questions × 2 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 22
- JSON illisible : 6
- type ou champ manquant : 3
- clé inconnue : 3
- nom inconnu dans une expression : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-co2-ionique#1 | chimie | complète | oui | 5 | 15.2 s | 38.7 s | 3 | 0 | — | 0 | chimie_structure |
| ap-co2-ionique#2 | chimie | complète | oui | 5 | 3.6 s | 18.3 s | 1 | 2 | — | 0 | chimie_structure |
| ap-gaz-ballons-helium#1 | chimie | complète | oui | 6 | 6.4 s | 31.5 s | 2 | 2 | — | 0 | chimie_gaz |
| ap-gaz-ballons-helium#2 | chimie | complète | oui | 5 | 3.7 s | 33.9 s | 2 | 1 | — | 0 | chimie_gaz |
| ap-gaz-melange-methane#1 | chimie | complète | oui | 5 | 17.6 s | 29.6 s | 3 | 2 | — | 0 | chimie_gaz |
| ap-gaz-melange-methane#2 | chimie | complète | oui | 6 | 3.2 s | 23.9 s | 1 | 0 | — | 0 | chimie_gaz |
| ap-gaz-pression-variations#1 | chimie | complète | oui | 5 | 3.1 s | 42.1 s | 2 | 0 | — | 0 | chimie_gaz |
| ap-gaz-pression-variations#2 | chimie | complète | oui | 4 | 6.3 s | 18.0 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-kc-donnee-manquante#1 | chimie | complète | oui | 5 | 4.8 s | 25.1 s | 1 | 0 | — | 2 | chimie_equilibre, chimie_concentration |
| ap-kc-donnee-manquante#2 | chimie | complète | oui | 4 | 3.5 s | 17.1 s | 0 | 3 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-loi-hess#1 | chimie | complète | oui | 5 | 13.2 s | 21.7 s | 3 | 1 | — | 1 | chimie_energie |
| ap-loi-hess#2 | chimie | complète | oui | 6 | 2.0 s | 14.6 s | 0 | 1 | — | 0 | chimie_energie |
| ap-ph5-base#1 | chimie | complète | oui | 3 | 3.8 s | 7.7 s | 0 | 0 | — | 0 | chimie_acides |
| ap-ph5-base#2 | chimie | complète | oui | 4 | 2.9 s | 12.8 s | 0 | 0 | — | 1 | chimie_acides |
| ap-titrage-yamaska#1 | chimie | complète | oui | 5 | 5.9 s | 25.8 s | 0 | 1 | — | 0 | chimie_acides |
| ap-titrage-yamaska#2 | chimie | complète | oui | 6 | 5.8 s | 45.8 s | 4 | 1 | — | 2 | chimie_acides |
| ap-parabole-foyer#1 | mathematiques | complète | oui | 5 | 4.9 s | 30.1 s | 3 | 0 | — | 2 | coniques, fonctions |
| ap-parabole-foyer#2 | mathematiques | complète | oui | 5 | 3.6 s | 17.3 s | 1 | 1 | — | 0 | coniques, fonctions |
| ap-sinus-cosinus#1 | mathematiques | complète | oui | 5 | 6.9 s | 16.7 s | 1 | 0 | — | 0 | fonctions, geometrie |
| ap-sinus-cosinus#2 | mathematiques | complète | oui | 4 | 5.0 s | 17.1 s | 1 | 1 | — | 0 | fonctions, geometrie |
| ap-trois-pieces#1 | mathematiques | complète | oui | 5 | 6.1 s | 43.2 s | 2 | 0 | — | 0 | probabilites |
| ap-trois-pieces#2 | mathematiques | complète | oui | 6 | 4.1 s | 37.5 s | 2 | 0 | — | 2 | probabilites |
