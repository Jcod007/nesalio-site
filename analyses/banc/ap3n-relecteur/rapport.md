# Banc Nesalio — ap3n-relecteur

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 1 · questions : 24 · leçons : 24 · lancé le 2026-11-10T00:18:42.099Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **21/24 (87.5 %)** |
| — dont chimie | 14/16 (87.5 %) |
| — dont mathematiques | 7/8 (87.5 %) |
| Issues | erreur invalid : 2 ; complète : 21 ; erreur incomplete : 1 |
| 1re tranche (médiane / max) | 4.5 s / 9.8 s |
| Durée totale (médiane / max) | 16.5 s / 42.4 s |
| Refus (corrections demandées) | 28 |
| Réparations sans appel | 25 |
| Lignes JSON illisibles | 1 |
| Appels au modèle | 50 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 610058, sortie 62831 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (24 questions × 1 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 21
- type ou champ manquant : 5
- nom inconnu dans une expression : 3
- leçon : erreur invalid : 2
- JSON illisible : 2
- repère absent : 1
- leçon : erreur incomplete : 1
- cible inconnue : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap3-caco3-atomes-oxygene#1 | chimie | erreur invalid | **non** | 0 | — | 3.8 s | 3 | 0 | — | 0 | chimie_mole |
| ap3-fes2-o2-moles#1 | chimie | complète | oui | 6 | 6.7 s | 42.4 s | 3 | 1 | — | 2 | chimie_stoechiometrie, chimie_mole |
| ap3-gaz-ambulance-o2#1 | chimie | complète | oui | 4 | 3.6 s | 19.7 s | 0 | 0 | — | 0 | chimie_gaz |
| ap3-gaz-boyle-pression-diminue#1 | chimie | complète | oui | 4 | 9.8 s | 25.2 s | 1 | 0 | — | 1 | chimie_gaz |
| ap3-gaz-charles-seringue#1 | chimie | complète | oui | 5 | 6.8 s | 16.2 s | 0 | 0 | — | 0 | chimie_gaz, geometrie |
| ap3-gaz-deplacement-eau#1 | chimie | complète | oui | 4 | 5.1 s | 14.3 s | 0 | 1 | — | 0 | chimie_gaz |
| ap3-gaz-stoechio-pression-diminue#1 | chimie | complète | oui | 5 | 2.6 s | 21.8 s | 1 | 1 | — | 1 | chimie_gaz, chimie_mole |
| ap3-gaz-volume-molaire-323k#1 | chimie | complète | oui | 4 | 4.6 s | 15.6 s | 0 | 1 | — | 0 | chimie_gaz |
| ap3-gaz-volume-molaire-caracteristique#1 | chimie | complète | oui | 5 | 1.4 s | 7.5 s | 0 | 0 | — | 0 | chimie_gaz |
| ap3-gaz-zinc-dihydrogene#1 | chimie | complète | oui | 5 | 4.7 s | 27.4 s | 2 | 2 | — | 0 | chimie_acides |
| ap3-grammes-reactif-non-limitant#1 | chimie | erreur incomplete | **non** | 2 | 3.3 s | 14.1 s | 3 | 1 | — | 0 | aucun |
| ap3-h2o2-concentration#1 | chimie | complète | oui | 5 | 5.2 s | 16.7 s | 0 | 3 | — | 0 | chimie_concentration |
| ap3-masse-molaire-coefficients#1 | chimie | complète | oui | 4 | 4.5 s | 14.3 s | 0 | 1 | — | 0 | chimie_mole |
| ap3-nh3-cuo-limitant#1 | chimie | complète | oui | 6 | 5.9 s | 35.0 s | 2 | 1 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap3-octane-masse-eau#1 | chimie | complète | oui | 4 | 5.5 s | 12.1 s | 0 | 2 | — | 1 | chimie_balancement |
| ap3-rendement-theorique#1 | chimie | complète | oui | 6 | 3.9 s | 15.9 s | 0 | 1 | — | 0 | aucun |
| ap3-ecart-moyen-liste#1 | mathematiques | complète | oui | 5 | 2.6 s | 10.5 s | 0 | 1 | — | 1 | aucun |
| ap3-interet-compose-taux#1 | mathematiques | erreur invalid | **non** | 0 | — | 4.8 s | 3 | 0 | — | 0 | finances |
| ap3-loi-cosinus-obtus#1 | mathematiques | complète | oui | 5 | 5.7 s | 31.0 s | 1 | 1 | — | 4 | trigonometrie, geometrie |
| ap3-optimisation-constante#1 | mathematiques | complète | oui | 4 | 3.4 s | 10.3 s | 0 | 2 | — | 1 | aucun |
| ap3-point-partage-milieu#1 | mathematiques | complète | oui | 4 | 4.5 s | 24.5 s | 2 | 1 | — | 0 | analytique |
| ap3-racine-croissance#1 | mathematiques | complète | oui | 4 | 3.0 s | 29.3 s | 3 | 2 | — | 1 | fonctions, algebre |
| ap3-sinus-domaine#1 | mathematiques | complète | oui | 6 | 2.2 s | 28.1 s | 1 | 3 | — | 0 | fonctions, geometrie |
| ap3-vecteurs-polaires#1 | mathematiques | complète | oui | 5 | 6.7 s | 21.0 s | 3 | 0 | — | 0 | geometrie |
