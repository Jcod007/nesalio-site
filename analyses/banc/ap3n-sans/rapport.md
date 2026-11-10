# Banc Nesalio — ap3n-sans

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 1 · questions : 24 · leçons : 24 · lancé le 2026-11-10T00:17:04.246Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **21/24 (87.5 %)** |
| — dont chimie | 14/16 (87.5 %) |
| — dont mathematiques | 7/8 (87.5 %) |
| Issues | complète : 21 ; erreur incomplete : 2 ; erreur invalid : 1 |
| 1re tranche (médiane / max) | 3.2 s / 6.2 s |
| Durée totale (médiane / max) | 11.5 s / 29.0 s |
| Refus (corrections demandées) | 16 |
| Réparations sans appel | 28 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 37 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 434623, sortie 55630 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (24 questions × 1 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 12
- type ou champ manquant : 4
- leçon : erreur incomplete : 2
- repère absent : 2
- cible inconnue : 1
- clé inconnue : 1
- leçon : erreur invalid : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap3-caco3-atomes-oxygene#1 | chimie | complète | oui | 5 | 5.4 s | 11.0 s | 0 | 4 | — | 0 | chimie_mole |
| ap3-fes2-o2-moles#1 | chimie | erreur incomplete | **non** | 1 | 4.2 s | 12.8 s | 3 | 0 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap3-gaz-ambulance-o2#1 | chimie | complète | oui | 4 | 2.9 s | 7.8 s | 0 | 1 | — | 0 | chimie_gaz |
| ap3-gaz-boyle-pression-diminue#1 | chimie | complète | oui | 6 | 3.2 s | 14.8 s | 0 | 2 | — | 5 | chimie_gaz |
| ap3-gaz-charles-seringue#1 | chimie | complète | oui | 5 | 3.2 s | 12.3 s | 0 | 2 | — | 0 | chimie_gaz, geometrie |
| ap3-gaz-deplacement-eau#1 | chimie | complète | oui | 4 | 3.6 s | 10.5 s | 1 | 1 | — | 0 | chimie_gaz |
| ap3-gaz-stoechio-pression-diminue#1 | chimie | complète | oui | 5 | 2.4 s | 12.0 s | 0 | 2 | — | 1 | chimie_gaz, chimie_mole |
| ap3-gaz-volume-molaire-323k#1 | chimie | complète | oui | 4 | 5.0 s | 10.6 s | 0 | 2 | — | 0 | chimie_gaz |
| ap3-gaz-volume-molaire-caracteristique#1 | chimie | complète | oui | 5 | 3.1 s | 9.3 s | 0 | 0 | — | 0 | chimie_gaz |
| ap3-gaz-zinc-dihydrogene#1 | chimie | complète | oui | 5 | 3.5 s | 11.5 s | 0 | 3 | — | 0 | chimie_acides |
| ap3-grammes-reactif-non-limitant#1 | chimie | complète | oui | 5 | 3.4 s | 12.5 s | 1 | 0 | — | 0 | aucun |
| ap3-h2o2-concentration#1 | chimie | complète | oui | 4 | 2.8 s | 9.6 s | 0 | 0 | — | 1 | chimie_concentration |
| ap3-masse-molaire-coefficients#1 | chimie | complète | oui | 4 | 2.1 s | 8.3 s | 0 | 1 | — | 0 | chimie_mole |
| ap3-nh3-cuo-limitant#1 | chimie | complète | oui | 4 | 6.2 s | 16.7 s | 0 | 2 | — | 1 | chimie_stoechiometrie, chimie_mole |
| ap3-octane-masse-eau#1 | chimie | complète | oui | 4 | 5.2 s | 15.3 s | 1 | 0 | — | 0 | chimie_balancement |
| ap3-rendement-theorique#1 | chimie | erreur incomplete | **non** | 3 | 2.3 s | 19.3 s | 3 | 1 | — | 3 | aucun |
| ap3-ecart-moyen-liste#1 | mathematiques | complète | oui | 5 | 2.2 s | 9.8 s | 0 | 0 | — | 0 | aucun |
| ap3-interet-compose-taux#1 | mathematiques | complète | oui | 4 | 5.0 s | 13.7 s | 0 | 2 | — | 1 | finances |
| ap3-loi-cosinus-obtus#1 | mathematiques | complète | oui | 4 | 4.0 s | 10.1 s | 0 | 0 | — | 0 | trigonometrie, geometrie |
| ap3-optimisation-constante#1 | mathematiques | complète | oui | 4 | 2.5 s | 8.0 s | 0 | 2 | — | 0 | aucun |
| ap3-point-partage-milieu#1 | mathematiques | complète | oui | 5 | 3.0 s | 29.0 s | 3 | 1 | — | 2 | analytique |
| ap3-racine-croissance#1 | mathematiques | complète | oui | 5 | 3.4 s | 11.6 s | 0 | 1 | — | 1 | fonctions, algebre |
| ap3-sinus-domaine#1 | mathematiques | erreur invalid | **non** | 0 | — | 9.8 s | 3 | 0 | — | 0 | fonctions, geometrie |
| ap3-vecteurs-polaires#1 | mathematiques | complète | oui | 5 | 3.1 s | 13.0 s | 1 | 1 | — | 0 | geometrie |
