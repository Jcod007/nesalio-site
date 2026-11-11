# Banc Nesalio — ap3-relecteur

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 1 · questions : 54 · leçons : 54 · lancé le 2026-11-10T00:11:16.519Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **50/54 (92.6 %)** |
| — dont chimie | 29/32 (90.6 %) |
| — dont mathematiques | 21/22 (95.5 %) |
| Issues | complète : 50 ; erreur incomplete : 4 |
| 1re tranche (médiane / max) | 3.1 s / 8.9 s |
| Durée totale (médiane / max) | 17.9 s / 46.6 s |
| Refus (corrections demandées) | 69 |
| Réparations sans appel | 46 |
| Lignes JSON illisibles | 3 |
| Appels au modèle | 120 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 1518223, sortie 158339 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (54 questions × 1 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 48
- type ou champ manquant : 12
- JSON illisible : 6
- cible inconnue : 5
- leçon : erreur incomplete : 4
- clé inconnue : 2
- repère absent : 2
- identifiant invalide : 2

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-acide-base-sel#1 | chimie | complète | oui | 4 | 4.3 s | 13.8 s | 0 | 2 | — | 0 | chimie_acides |
| ap-bicarbonate-vinaigre#1 | chimie | complète | oui | 5 | 2.7 s | 36.8 s | 4 | 1 | — | 0 | chimie_acides, chimie_balancement |
| ap-co2-ionique#1 | chimie | complète | oui | 5 | 1.9 s | 24.6 s | 2 | 0 | — | 0 | chimie_structure |
| ap-complexe-active#1 | chimie | complète | oui | 5 | 2.3 s | 33.2 s | 2 | 0 | — | 1 | chimie_energie |
| ap-conductibilite-ph#1 | chimie | complète | oui | 5 | 3.6 s | 15.8 s | 0 | 0 | — | 0 | chimie_acides |
| ap-endo-exo#1 | chimie | complète | oui | 3 | 3.6 s | 16.2 s | 1 | 0 | — | 1 | chimie_energie |
| ap-endo-exo-exemples#1 | chimie | complète | oui | 5 | 1.6 s | 14.1 s | 0 | 0 | — | 0 | chimie_energie, chimie_balancement |
| ap-equilibrer#1 | chimie | complète | oui | 6 | 2.6 s | 30.3 s | 3 | 1 | — | 0 | chimie_balancement |
| ap-gaz-ballons-helium#1 | chimie | erreur incomplete | **non** | 1 | 2.7 s | 11.4 s | 3 | 0 | — | 0 | chimie_gaz |
| ap-gaz-conversion-pression#1 | chimie | complète | oui | 5 | 3.5 s | 22.2 s | 1 | 0 | — | 0 | chimie_gaz |
| ap-gaz-melange-methane#1 | chimie | complète | oui | 5 | 3.9 s | 17.0 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-moles-temperature#1 | chimie | complète | oui | 4 | 3.6 s | 13.4 s | 0 | 0 | — | 0 | chimie_gaz, chimie_mole |
| ap-gaz-pression-variations#1 | chimie | erreur incomplete | **non** | 2 | 2.1 s | 32.5 s | 4 | 1 | — | 0 | chimie_gaz |
| ap-gaz-pressions-partielles#1 | chimie | complète | oui | 5 | 3.3 s | 16.5 s | 0 | 1 | — | 1 | chimie_gaz, chimie_mole |
| ap-gaz-theorie-cinetique#1 | chimie | complète | oui | 1 | 1.7 s | 1.7 s | 0 | 0 | — | 0 | chimie_gaz |
| ap-gaz-volume-so2#1 | chimie | complète | oui | 4 | 3.6 s | 15.0 s | 1 | 2 | — | 1 | chimie_gaz |
| ap-isoler-temperature#1 | chimie | complète | oui | 4 | 4.5 s | 15.3 s | 1 | 0 | — | 0 | algebre, chimie_gaz |
| ap-kc-donnee-manquante#1 | chimie | complète | oui | 5 | 2.9 s | 11.7 s | 0 | 1 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kc-solide#1 | chimie | complète | oui | 5 | 3.9 s | 12.3 s | 0 | 5 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kps-solubilite#1 | chimie | complète | oui | 5 | 4.0 s | 38.2 s | 3 | 1 | — | 0 | chimie_equilibre, chimie_acides |
| ap-le-chatelier-concentration#1 | chimie | complète | oui | 5 | 3.7 s | 13.5 s | 0 | 3 | — | 1 | chimie_equilibre, chimie_concentration |
| ap-loi-hess#1 | chimie | complète | oui | 4 | 6.0 s | 14.4 s | 0 | 2 | — | 0 | chimie_energie |
| ap-masse-moles#1 | chimie | complète | oui | 5 | 2.0 s | 14.9 s | 0 | 1 | — | 1 | chimie_stoechiometrie, chimie_mole |
| ap-ph-log#1 | chimie | complète | oui | 4 | 3.1 s | 19.0 s | 1 | 0 | — | 4 | chimie_acides, chimie_concentration |
| ap-ph5-base#1 | chimie | erreur incomplete | **non** | 3 | 4.1 s | 21.7 s | 4 | 0 | — | 0 | chimie_acides |
| ap-ppm-mol#1 | chimie | complète | oui | 4 | 2.5 s | 26.1 s | 2 | 0 | — | 0 | chimie_concentration |
| ap-reactif-limitant#1 | chimie | complète | oui | 4 | 3.4 s | 21.7 s | 1 | 2 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap-solubilite-g-mol#1 | chimie | complète | oui | 6 | 1.5 s | 19.8 s | 2 | 2 | — | 0 | chimie_concentration |
| ap-stoechio-moles#1 | chimie | complète | oui | 5 | 3.6 s | 14.3 s | 0 | 2 | — | 0 | chimie_mole |
| ap-titrage-yamaska#1 | chimie | complète | oui | 6 | 2.6 s | 46.6 s | 4 | 1 | — | 0 | chimie_acides |
| ap-vitesse-ordre-2#1 | chimie | complète | oui | 4 | 2.8 s | 11.5 s | 0 | 1 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-zinc-hcl#1 | chimie | complète | oui | 4 | 3.2 s | 10.3 s | 0 | 2 | — | 1 | chimie_acides, chimie_balancement |
| ap-correlation-force#1 | mathematiques | complète | oui | 5 | 8.0 s | 34.8 s | 1 | 0 | — | 21 | statistiques |
| ap-correlation-tableau#1 | mathematiques | complète | oui | 6 | 3.1 s | 23.0 s | 1 | 0 | — | 1 | statistiques |
| ap-ellipse-b#1 | mathematiques | complète | oui | 4 | 3.6 s | 13.5 s | 0 | 0 | — | 0 | aucun |
| ap-exponentielle-bases#1 | mathematiques | complète | oui | 5 | 2.5 s | 33.8 s | 3 | 1 | — | 0 | fonctions |
| ap-factoriser-cubique#1 | mathematiques | complète | oui | 5 | 2.0 s | 18.3 s | 2 | 1 | — | 0 | polynomes |
| ap-forme-generale#1 | mathematiques | complète | oui | 4 | 2.5 s | 11.1 s | 0 | 0 | — | 0 | analytique, algebre |
| ap-graphes-chemin#1 | mathematiques | complète | oui | 4 | 8.9 s | 20.0 s | 1 | 1 | — | 0 | graphes |
| ap-inequation-valeur-absolue#1 | mathematiques | complète | oui | 6 | 3.4 s | 30.2 s | 1 | 2 | — | 1 | valeur_absolue, fonctions |
| ap-mediane#1 | mathematiques | complète | oui | 5 | 3.1 s | 23.3 s | 1 | 1 | — | 2 | statistiques |
| ap-parabole-foyer#1 | mathematiques | complète | oui | 5 | 1.7 s | 25.7 s | 2 | 1 | — | 4 | coniques, fonctions |
| ap-pente-un-point#1 | mathematiques | complète | oui | 6 | 2.6 s | 17.1 s | 1 | 1 | — | 1 | analytique, algebre |
| ap-periodique-periode#1 | mathematiques | complète | oui | 3 | 3.8 s | 15.0 s | 2 | 0 | — | 0 | fonctions |
| ap-perpendiculaire-point#1 | mathematiques | complète | oui | 2 | 3.0 s | 6.8 s | 0 | 0 | — | 0 | analytique, algebre |
| ap-polygone-contraintes#1 | mathematiques | complète | oui | 6 | 3.1 s | 27.0 s | 2 | 0 | — | 1 | programmation_lineaire, algebre |
| ap-proba-conditionnelle-venn#1 | mathematiques | complète | oui | 4 | 4.1 s | 17.6 s | 1 | 2 | — | 2 | probabilites |
| ap-quadratique-table#1 | mathematiques | complète | oui | 5 | 3.2 s | 21.0 s | 0 | 0 | — | 2 | fonctions, polynomes |
| ap-regle-majorite#1 | mathematiques | complète | oui | 5 | 3.3 s | 21.5 s | 1 | 2 | — | 0 | vote_majorite |
| ap-sinus-cosinus#1 | mathematiques | erreur incomplete | **non** | 1 | 2.3 s | 9.7 s | 3 | 0 | — | 0 | fonctions, geometrie |
| ap-systeme-produit#1 | mathematiques | complète | oui | 3 | 3.2 s | 32.2 s | 3 | 0 | — | 0 | systemes |
| ap-trigo-rectangle#1 | mathematiques | complète | oui | 4 | 3.0 s | 14.1 s | 1 | 0 | — | 1 | geometrie |
| ap-trois-pieces#1 | mathematiques | complète | oui | 5 | 3.9 s | 33.0 s | 3 | 2 | — | 1 | probabilites |
| ap-zeros-partie-entiere#1 | mathematiques | complète | oui | 5 | 3.0 s | 18.4 s | 1 | 0 | — | 0 | fonctions |
