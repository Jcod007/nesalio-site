# Banc Nesalio — ap2-allegees

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 54 · leçons : 108 · lancé le 2026-11-09T23:38:48.486Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **101/108 (93.5 %)** |
| — dont chimie | 59/64 (92.2 %) |
| — dont mathematiques | 42/44 (95.5 %) |
| Issues | complète : 104 ; erreur incomplete : 2 ; erreur invalid : 2 |
| 1re tranche (médiane / max) | 3.1 s / 26.8 s |
| Durée totale (médiane / max) | 12.6 s / 44.9 s |
| Refus (corrections demandées) | 78 |
| Réparations sans appel | 105 |
| Lignes JSON illisibles | 15 |
| Appels au modèle | 182 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 2199084, sortie 278039 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

**Non atteint** : 93.5 % pour un seuil de 95 % (54 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 36
- JSON illisible : 28
- type ou champ manquant : 18
- repère absent : 9
- clé inconnue : 7
- identifiant invalide : 5
- tranche perdue sans refus : 4
- leçon : erreur incomplete : 2
- leçon : erreur invalid : 2
- cible inconnue : 2
- objet visé après remove : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-acide-base-sel#1 | chimie | complète | oui | 6 | 4.3 s | 39.9 s | 1 | 3 | — | 0 | chimie_acides |
| ap-acide-base-sel#2 | chimie | complète | oui | 6 | 2.1 s | 15.0 s | 1 | 3 | — | 0 | chimie_acides |
| ap-bicarbonate-vinaigre#1 | chimie | complète | oui | 5 | 2.4 s | 20.7 s | 3 | 2 | — | 0 | chimie_acides, chimie_balancement |
| ap-bicarbonate-vinaigre#2 | chimie | complète | oui | 5 | 3.8 s | 13.2 s | 1 | 3 | — | 3 | chimie_acides, chimie_balancement |
| ap-co2-ionique#1 | chimie | erreur incomplete | **non** | 3 | 19.8 s | 44.9 s | 4 | 1 | — | 0 | chimie_structure |
| ap-co2-ionique#2 | chimie | complète | oui | 3 | 2.6 s | 6.1 s | 0 | 1 | — | 0 | chimie_structure |
| ap-complexe-active#1 | chimie | complète | oui | 5 | 4.9 s | 12.8 s | 0 | 2 | — | 0 | chimie_energie |
| ap-complexe-active#2 | chimie | complète | oui | 5 | 3.5 s | 17.7 s | 1 | 1 | — | 4 | chimie_energie |
| ap-conductibilite-ph#1 | chimie | complète | oui | 5 | 3.7 s | 9.4 s | 0 | 0 | — | 0 | chimie_acides |
| ap-conductibilite-ph#2 | chimie | complète | oui | 5 | 4.6 s | 12.8 s | 0 | 1 | — | 0 | chimie_acides |
| ap-endo-exo#1 | chimie | complète | oui | 6 | 3.0 s | 16.6 s | 1 | 0 | — | 0 | chimie_energie |
| ap-endo-exo#2 | chimie | complète | oui | 4 | 3.6 s | 15.3 s | 0 | 0 | — | 0 | chimie_energie |
| ap-endo-exo-exemples#1 | chimie | complète | oui | 3 | 2.9 s | 9.4 s | 2 | 0 | — | 2 | chimie_energie, chimie_balancement |
| ap-endo-exo-exemples#2 | chimie | complète | oui | 6 | 2.7 s | 19.6 s | 1 | 2 | — | 0 | chimie_energie, chimie_balancement |
| ap-equilibrer#1 | chimie | complète | oui | 3 | 2.7 s | 9.1 s | 0 | 1 | — | 0 | chimie_balancement |
| ap-equilibrer#2 | chimie | complète | oui | 5 | 5.4 s | 12.7 s | 0 | 1 | — | 9 | chimie_balancement |
| ap-gaz-ballons-helium#1 | chimie | complète | oui | 5 | 4.1 s | 17.7 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-ballons-helium#2 | chimie | complète | oui | 5 | 3.3 s | 13.8 s | 1 | 1 | — | 0 | chimie_gaz |
| ap-gaz-conversion-pression#1 | chimie | complète | oui | 4 | 4.3 s | 11.1 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-conversion-pression#2 | chimie | complète | oui | 4 | 2.9 s | 10.4 s | 0 | 2 | — | 0 | chimie_gaz |
| ap-gaz-melange-methane#1 | chimie | complète | oui | 5 | 9.8 s | 32.7 s | 3 | 1 | — | 0 | chimie_gaz |
| ap-gaz-melange-methane#2 | chimie | erreur invalid (perdue : s_donnees) | **non** | 0 | — | 9.8 s | 3 | 0 | — | 0 | chimie_gaz |
| ap-gaz-moles-temperature#1 | chimie | complète | oui | 4 | 6.9 s | 15.0 s | 2 | 0 | — | 0 | chimie_gaz, chimie_mole |
| ap-gaz-moles-temperature#2 | chimie | complète | oui | 5 | 4.6 s | 22.0 s | 2 | 0 | — | 2 | chimie_gaz, chimie_mole |
| ap-gaz-pression-variations#1 | chimie | complète | oui | 4 | 4.1 s | 10.6 s | 0 | 2 | — | 0 | chimie_gaz |
| ap-gaz-pression-variations#2 | chimie | complète | oui | 5 | 4.7 s | 17.8 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-pressions-partielles#1 | chimie | complète | oui | 5 | 1.8 s | 14.8 s | 1 | 0 | — | 1 | chimie_gaz, chimie_mole |
| ap-gaz-pressions-partielles#2 | chimie | complète | oui | 4 | 3.0 s | 10.2 s | 0 | 0 | — | 0 | chimie_gaz, chimie_mole |
| ap-gaz-theorie-cinetique#1 | chimie | complète | oui | 5 | 3.5 s | 16.1 s | 1 | 0 | — | 3 | chimie_gaz |
| ap-gaz-theorie-cinetique#2 | chimie | complète | oui | 6 | 1.8 s | 20.3 s | 2 | 0 | — | 0 | chimie_gaz |
| ap-gaz-volume-so2#1 | chimie | complète | oui | 4 | 3.1 s | 8.3 s | 0 | 1 | — | 0 | chimie_gaz |
| ap-gaz-volume-so2#2 | chimie | complète | oui | 4 | 4.2 s | 11.1 s | 0 | 1 | — | 1 | chimie_gaz |
| ap-isoler-temperature#1 | chimie | complète | oui | 4 | 3.9 s | 11.4 s | 0 | 0 | — | 0 | algebre, chimie_gaz |
| ap-isoler-temperature#2 | chimie | complète | oui | 6 | 4.3 s | 19.7 s | 1 | 1 | — | 0 | algebre, chimie_gaz |
| ap-kc-donnee-manquante#1 | chimie | complète | oui | 5 | 4.8 s | 12.4 s | 0 | 5 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kc-donnee-manquante#2 | chimie | erreur incomplete | **non** | 3 | 2.6 s | 18.3 s | 4 | 0 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kc-solide#1 | chimie | complète | oui | 4 | 2.7 s | 8.0 s | 0 | 4 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kc-solide#2 | chimie | complète | oui | 5 | 2.9 s | 11.6 s | 0 | 3 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kps-solubilite#1 | chimie | complète | oui | 4 | 2.1 s | 7.8 s | 0 | 0 | — | 0 | chimie_equilibre, chimie_acides |
| ap-kps-solubilite#2 | chimie | complète | oui | 5 | 5.5 s | 14.5 s | 1 | 1 | — | 2 | chimie_equilibre, chimie_acides |
| ap-le-chatelier-concentration#1 | chimie | complète | oui | 4 | 3.9 s | 7.9 s | 1 | 1 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-le-chatelier-concentration#2 | chimie | complète | oui | 5 | 3.1 s | 18.1 s | 2 | 0 | — | 1 | chimie_equilibre, chimie_concentration |
| ap-loi-hess#1 | chimie | complète | oui | 4 | 4.1 s | 12.1 s | 0 | 1 | — | 0 | chimie_energie |
| ap-loi-hess#2 | chimie | complète (perdue : (sans identifiant)) | **non** | 5 | 5.0 s | 13.4 s | 1 | 1 | — | 0 | chimie_energie |
| ap-masse-moles#1 | chimie | complète | oui | 6 | 26.8 s | 37.5 s | 1 | 5 | — | 2 | chimie_stoechiometrie, chimie_mole |
| ap-masse-moles#2 | chimie | complète | oui | 6 | 2.1 s | 17.2 s | 1 | 1 | — | 1 | chimie_stoechiometrie, chimie_mole |
| ap-ph-log#1 | chimie | complète | oui | 4 | 2.5 s | 9.7 s | 0 | 0 | — | 0 | chimie_acides, chimie_concentration |
| ap-ph-log#2 | chimie | complète | oui | 6 | 2.8 s | 13.6 s | 1 | 1 | — | 1 | chimie_acides, chimie_concentration |
| ap-ph5-base#1 | chimie | complète | oui | 4 | 4.0 s | 12.6 s | 1 | 0 | — | 1 | chimie_acides |
| ap-ph5-base#2 | chimie | complète | oui | 3 | 4.3 s | 8.0 s | 0 | 0 | — | 0 | chimie_acides |
| ap-ppm-mol#1 | chimie | complète | oui | 4 | 2.8 s | 9.0 s | 0 | 0 | — | 0 | chimie_concentration |
| ap-ppm-mol#2 | chimie | complète | oui | 5 | 5.6 s | 14.2 s | 1 | 1 | — | 0 | chimie_concentration |
| ap-reactif-limitant#1 | chimie | complète | oui | 4 | 2.5 s | 10.2 s | 1 | 2 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap-reactif-limitant#2 | chimie | complète | oui | 4 | 4.2 s | 11.2 s | 0 | 1 | — | 1 | chimie_stoechiometrie, chimie_mole |
| ap-solubilite-g-mol#1 | chimie | complète | oui | 3 | 3.0 s | 6.3 s | 0 | 2 | — | 1 | chimie_concentration |
| ap-solubilite-g-mol#2 | chimie | complète | oui | 4 | 4.1 s | 10.5 s | 0 | 0 | — | 1 | chimie_concentration |
| ap-stoechio-moles#1 | chimie | complète | oui | 5 | 3.0 s | 12.2 s | 0 | 2 | — | 0 | chimie_mole |
| ap-stoechio-moles#2 | chimie | complète | oui | 4 | 3.2 s | 9.4 s | 0 | 2 | — | 0 | chimie_mole |
| ap-titrage-yamaska#1 | chimie | complète (perdue : (sans identifiant)) | **non** | 5 | 9.0 s | 20.4 s | 2 | 1 | — | 0 | chimie_acides |
| ap-titrage-yamaska#2 | chimie | complète | oui | 5 | 3.1 s | 14.6 s | 1 | 2 | — | 0 | chimie_acides |
| ap-vitesse-ordre-2#1 | chimie | complète | oui | 5 | 3.8 s | 20.4 s | 2 | 0 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-vitesse-ordre-2#2 | chimie | complète | oui | 4 | 3.0 s | 9.5 s | 0 | 1 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-zinc-hcl#1 | chimie | complète | oui | 4 | 3.0 s | 40.3 s | 2 | 2 | — | 1 | chimie_acides, chimie_balancement |
| ap-zinc-hcl#2 | chimie | complète | oui | 4 | 2.3 s | 7.2 s | 0 | 2 | — | 0 | chimie_acides, chimie_balancement |
| ap-correlation-force#1 | mathematiques | complète | oui | 5 | 2.9 s | 11.7 s | 0 | 0 | — | 0 | statistiques |
| ap-correlation-force#2 | mathematiques | complète | oui | 5 | 7.9 s | 16.6 s | 1 | 0 | — | 0 | statistiques |
| ap-correlation-tableau#1 | mathematiques | complète | oui | 4 | 3.8 s | 9.3 s | 0 | 1 | — | 0 | statistiques |
| ap-correlation-tableau#2 | mathematiques | complète | oui | 6 | 2.0 s | 15.7 s | 1 | 2 | — | 1 | statistiques |
| ap-ellipse-b#1 | mathematiques | complète | oui | 5 | 2.4 s | 8.5 s | 0 | 1 | — | 0 | aucun |
| ap-ellipse-b#2 | mathematiques | complète | oui | 4 | 3.9 s | 10.9 s | 0 | 1 | — | 0 | aucun |
| ap-exponentielle-bases#1 | mathematiques | complète | oui | 5 | 2.8 s | 16.5 s | 1 | 0 | — | 0 | fonctions |
| ap-exponentielle-bases#2 | mathematiques | complète | oui | 5 | 3.0 s | 20.5 s | 2 | 0 | — | 0 | fonctions |
| ap-factoriser-cubique#1 | mathematiques | complète | oui | 6 | 2.7 s | 15.3 s | 1 | 0 | — | 0 | polynomes |
| ap-factoriser-cubique#2 | mathematiques | complète | oui | 4 | 2.8 s | 10.5 s | 0 | 1 | — | 0 | polynomes |
| ap-forme-generale#1 | mathematiques | complète | oui | 5 | 2.4 s | 7.0 s | 0 | 0 | — | 0 | analytique, algebre |
| ap-forme-generale#2 | mathematiques | complète | oui | 4 | 2.5 s | 8.4 s | 1 | 2 | — | 0 | analytique, algebre |
| ap-graphes-chemin#1 | mathematiques | complète | oui | 6 | 1.8 s | 13.7 s | 1 | 0 | — | 8 | graphes |
| ap-graphes-chemin#2 | mathematiques | complète | oui | 3 | 6.3 s | 12.5 s | 0 | 1 | — | 0 | graphes |
| ap-inequation-valeur-absolue#1 | mathematiques | complète | oui | 4 | 3.0 s | 12.8 s | 0 | 0 | — | 1 | valeur_absolue, fonctions |
| ap-inequation-valeur-absolue#2 | mathematiques | complète | oui | 5 | 3.1 s | 14.6 s | 0 | 3 | — | 0 | valeur_absolue, fonctions |
| ap-mediane#1 | mathematiques | complète | oui | 4 | 2.8 s | 10.3 s | 0 | 1 | — | 0 | statistiques |
| ap-mediane#2 | mathematiques | complète | oui | 6 | 3.1 s | 11.2 s | 0 | 0 | — | 10 | statistiques |
| ap-parabole-foyer#1 | mathematiques | erreur invalid | **non** | 0 | — | 4.8 s | 3 | 0 | — | 0 | coniques, fonctions |
| ap-parabole-foyer#2 | mathematiques | complète | oui | 4 | 4.0 s | 10.1 s | 0 | 1 | — | 0 | coniques, fonctions |
| ap-pente-un-point#1 | mathematiques | complète | oui | 4 | 3.5 s | 14.2 s | 1 | 0 | — | 0 | analytique, algebre |
| ap-pente-un-point#2 | mathematiques | complète | oui | 4 | 2.7 s | 9.2 s | 0 | 1 | — | 1 | analytique, algebre |
| ap-periodique-periode#1 | mathematiques | complète | oui | 5 | 2.1 s | 8.3 s | 0 | 0 | — | 0 | fonctions |
| ap-periodique-periode#2 | mathematiques | complète | oui | 5 | 1.3 s | 15.8 s | 2 | 1 | — | 0 | fonctions |
| ap-perpendiculaire-point#1 | mathematiques | complète | oui | 6 | 2.2 s | 12.8 s | 0 | 4 | — | 3 | analytique, algebre |
| ap-perpendiculaire-point#2 | mathematiques | complète | oui | 6 | 3.3 s | 11.3 s | 0 | 5 | — | 0 | analytique, algebre |
| ap-polygone-contraintes#1 | mathematiques | complète | oui | 6 | 2.9 s | 14.4 s | 1 | 0 | — | 0 | programmation_lineaire, algebre |
| ap-polygone-contraintes#2 | mathematiques | complète | oui | 5 | 4.2 s | 16.5 s | 0 | 0 | — | 0 | programmation_lineaire, algebre |
| ap-proba-conditionnelle-venn#1 | mathematiques | complète | oui | 5 | 3.2 s | 12.7 s | 0 | 0 | — | 0 | probabilites |
| ap-proba-conditionnelle-venn#2 | mathematiques | complète | oui | 6 | 1.7 s | 9.9 s | 0 | 0 | — | 1 | probabilites |
| ap-quadratique-table#1 | mathematiques | complète | oui | 4 | 3.2 s | 11.3 s | 0 | 0 | — | 0 | fonctions, polynomes |
| ap-quadratique-table#2 | mathematiques | complète | oui | 5 | 2.4 s | 15.1 s | 2 | 1 | — | 0 | fonctions, polynomes |
| ap-regle-majorite#1 | mathematiques | complète | oui | 4 | 3.3 s | 8.4 s | 0 | 0 | — | 0 | vote_majorite |
| ap-regle-majorite#2 | mathematiques | complète | oui | 5 | 4.6 s | 12.4 s | 1 | 2 | — | 0 | vote_majorite |
| ap-sinus-cosinus#1 | mathematiques | complète | oui | 4 | 2.9 s | 9.4 s | 0 | 0 | — | 1 | fonctions, geometrie |
| ap-sinus-cosinus#2 | mathematiques | complète | oui | 4 | 1.9 s | 6.9 s | 0 | 0 | — | 2 | fonctions, geometrie |
| ap-systeme-produit#1 | mathematiques | complète | oui | 6 | 2.7 s | 16.1 s | 1 | 0 | — | 0 | systemes |
| ap-systeme-produit#2 | mathematiques | complète | oui | 4 | 2.7 s | 9.6 s | 0 | 1 | — | 0 | systemes |
| ap-trigo-rectangle#1 | mathematiques | complète | oui | 4 | 2.7 s | 8.1 s | 0 | 0 | — | 0 | geometrie |
| ap-trigo-rectangle#2 | mathematiques | complète | oui | 4 | 4.4 s | 24.8 s | 2 | 0 | — | 4 | geometrie |
| ap-trois-pieces#1 | mathematiques | complète | oui | 3 | 3.6 s | 9.1 s | 0 | 1 | — | 7 | probabilites |
| ap-trois-pieces#2 | mathematiques | complète (perdue : (sans identifiant)) | **non** | 3 | 4.2 s | 16.3 s | 2 | 0 | — | 8 | probabilites |
| ap-zeros-partie-entiere#1 | mathematiques | complète | oui | 6 | 1.5 s | 8.7 s | 0 | 1 | — | 2 | fonctions |
| ap-zeros-partie-entiere#2 | mathematiques | complète | oui | 5 | 4.1 s | 12.7 s | 2 | 0 | — | 0 | fonctions |
