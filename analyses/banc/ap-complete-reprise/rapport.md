# Banc Nesalio — ap-complete-reprise

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 1 · questions : 19 · leçons : 19 · lancé le 2026-11-09T21:26:34.394Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **18/19 (94.7 %)** |
| — dont chimie | 15/16 (93.8 %) |
| — dont mathematiques | 3/3 (100.0 %) |
| Issues | complète : 18 ; erreur incomplete : 1 |
| 1re tranche (médiane / max) | 6.1 s / 58.1 s |
| Durée totale (médiane / max) | 17.1 s / 77.0 s |
| Refus (corrections demandées) | 14 |
| Réparations sans appel | 22 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 32 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 378765, sortie 41649 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (19 questions × 1 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 12
- clé inconnue : 2
- leçon : erreur incomplete : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-bicarbonate-vinaigre#1 | chimie | complète | oui | 4 | 5.2 s | 9.4 s | 0 | 2 | — | 1 | chimie_acides, chimie_balancement |
| ap-co2-ionique#1 | chimie | complète | oui | 4 | 4.2 s | 8.7 s | 0 | 1 | — | 0 | aucun |
| ap-complexe-active#1 | chimie | complète | oui | 4 | 5.4 s | 11.2 s | 0 | 0 | — | 0 | chimie_energie |
| ap-conductibilite-ph#1 | chimie | complète | oui | 6 | 6.3 s | 27.8 s | 1 | 0 | — | 1 | chimie_acides |
| ap-endo-exo#1 | chimie | complète | oui | 4 | 2.8 s | 9.3 s | 0 | 1 | — | 0 | aucun |
| ap-equilibrer#1 | chimie | complète | oui | 6 | 12.6 s | 36.5 s | 0 | 2 | — | 1 | chimie_balancement |
| ap-isoler-temperature#1 | chimie | complète | oui | 5 | 4.6 s | 10.4 s | 0 | 0 | — | 0 | algebre |
| ap-kc-donnee-manquante#1 | chimie | erreur incomplete | **non** | 1 | 58.1 s | 77.0 s | 4 | 0 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kps-solubilite#1 | chimie | complète | oui | 5 | 9.8 s | 21.6 s | 1 | 5 | — | 0 | chimie_equilibre, chimie_acides |
| ap-loi-hess#1 | chimie | complète | oui | 5 | 4.0 s | 14.0 s | 0 | 1 | — | 2 | chimie_energie |
| ap-ph-log#1 | chimie | complète | oui | 6 | 6.1 s | 23.8 s | 1 | 0 | — | 1 | chimie_acides, chimie_concentration |
| ap-ppm-mol#1 | chimie | complète | oui | 5 | 10.1 s | 17.1 s | 1 | 0 | — | 0 | chimie_concentration |
| ap-reactif-limitant#1 | chimie | complète | oui | 4 | 7.1 s | 14.5 s | 0 | 4 | — | 1 | chimie_mole |
| ap-solubilite-g-mol#1 | chimie | complète | oui | 5 | 2.8 s | 14.6 s | 0 | 0 | — | 1 | chimie_concentration |
| ap-titrage-yamaska#1 | chimie | complète | oui | 5 | 18.7 s | 19.0 s | 0 | 2 | — | 0 | chimie_acides |
| ap-vitesse-ordre-2#1 | chimie | complète | oui | 6 | 8.6 s | 28.7 s | 2 | 1 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-ellipse-b#1 | mathematiques | complète | oui | 4 | 5.5 s | 9.7 s | 0 | 2 | — | 1 | aucun |
| ap-forme-generale#1 | mathematiques | complète | oui | 4 | 6.5 s | 69.2 s | 3 | 0 | — | 0 | fonctions, algebre |
| ap-parabole-foyer#1 | mathematiques | complète | oui | 6 | 5.1 s | 62.5 s | 1 | 1 | — | 0 | fonctions |
