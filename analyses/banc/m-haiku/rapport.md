# Banc Nesalio — m-haiku

Modèle : `anthropic/claude-haiku-5.5` · tirages : 2 · questions : 32 · leçons : 64 · lancé le 2026-11-09T16:28:06.947Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **59/64 (92.2 %)** |
| — dont chimie | 18/20 (90.0 %) |
| — dont mathematiques | 41/44 (93.2 %) |
| Issues | complète : 59 ; erreur upstream : 2 ; erreur invalid : 2 ; erreur incomplete : 1 |
| 1re tranche (médiane / max) | 5.3 s / 48.4 s |
| Durée totale (médiane / max) | 12.4 s / 90.9 s |
| Refus (corrections demandées) | 22 |
| Réparations sans appel | 58 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 86 |
| Réponse attendue écrite au tableau | 51/60 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 971604, sortie 88578 |
| Coût approximatif | 0.1414 $ |

### Critère Q7 automatique (leçons intactes)

**Non atteint** : 92.2 % pour un seuil de 95 % (32 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 8
- cible inconnue : 5
- clé inconnue : 4
- identifiant invalide : 3
- leçon : erreur upstream : 2
- leçon : erreur invalid : 2
- type ou champ manquant : 2
- nom inconnu dans une expression : 1
- repère absent : 1
- leçon : erreur incomplete : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chimie-boyle-erreur#1 | chimie | complète | oui | 4 | 3.5 s | 9.5 s | 0 | 1 | oui | 2 | chimie_gaz |
| chimie-boyle-erreur#2 | chimie | complète | oui | 4 | 4.4 s | 10.4 s | 0 | 3 | oui | 0 | chimie_gaz |
| chimie-calorimetrie#1 | chimie | complète | oui | 3 | 17.2 s | 21.8 s | 0 | 2 | oui | 0 | chimie_energie |
| chimie-calorimetrie#2 | chimie | complète | oui | 3 | 3.6 s | 8.6 s | 0 | 2 | oui | 0 | chimie_energie |
| chimie-concentration#1 | chimie | complète | oui | 4 | 3.3 s | 25.7 s | 1 | 1 | oui | 0 | chimie_concentration |
| chimie-concentration#2 | chimie | complète | oui | 4 | 9.3 s | 19.2 s | 1 | 2 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#1 | chimie | complète | oui | 4 | 3.2 s | 8.3 s | 0 | 0 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#2 | chimie | erreur upstream | **non** | 0 | — | 10.1 s | 0 | 0 | — | 0 | chimie_concentration |
| chimie-equilibrer#1 | chimie | complète | oui | 5 | 3.4 s | 13.4 s | 1 | 0 | oui | 0 | chimie_balancement |
| chimie-equilibrer#2 | chimie | complète | oui | 3 | 3.8 s | 12.6 s | 1 | 2 | oui | 0 | chimie_balancement |
| chimie-gaz-parfaits#1 | chimie | complète | oui | 4 | 3.3 s | 8.5 s | 0 | 1 | **non** | 0 | chimie_gaz, chimie_mole |
| chimie-gaz-parfaits#2 | chimie | complète | oui | 4 | 4.1 s | 9.0 s | 0 | 0 | oui | 0 | chimie_gaz, chimie_mole |
| chimie-hess#1 | chimie | erreur upstream | **non** | 0 | — | 90.9 s | 0 | 0 | — | 0 | chimie_energie |
| chimie-hess#2 | chimie | complète | oui | 3 | 4.2 s | 7.9 s | 0 | 0 | oui | 0 | chimie_energie |
| chimie-kc#1 | chimie | complète | oui | 4 | 15.8 s | 21.7 s | 0 | 2 | oui | 0 | chimie_equilibre |
| chimie-kc#2 | chimie | complète | oui | 4 | 3.0 s | 8.6 s | 0 | 2 | oui | 0 | chimie_equilibre |
| chimie-mole#1 | chimie | complète | oui | 3 | 4.1 s | 7.4 s | 0 | 0 | oui | 1 | chimie_mole |
| chimie-mole#2 | chimie | complète | oui | 2 | 11.8 s | 26.7 s | 0 | 0 | **non** | 0 | chimie_mole |
| chimie-stoechio#1 | chimie | complète | oui | 4 | 4.0 s | 10.2 s | 0 | 0 | oui | 0 | chimie_stoechiometrie |
| chimie-stoechio#2 | chimie | complète | oui | 4 | 17.1 s | 23.2 s | 0 | 1 | oui | 0 | chimie_stoechiometrie |
| carre#1 | mathematiques | complète | oui | 3 | 5.4 s | 9.4 s | 0 | 0 | oui | 0 | polynomes |
| carre#2 | mathematiques | complète | oui | 4 | 7.0 s | 13.6 s | 0 | 0 | **non** | 0 | polynomes |
| completion#1 | mathematiques | complète | oui | 5 | 5.3 s | 10.7 s | 0 | 2 | oui | 0 | polynomes |
| completion#2 | mathematiques | complète | oui | 4 | 11.0 s | 14.7 s | 1 | 2 | oui | 0 | polynomes |
| correlation-sens#1 | mathematiques | complète | oui | 5 | 5.6 s | 15.9 s | 1 | 1 | oui | 0 | statistiques |
| correlation-sens#2 | mathematiques | complète | oui | 5 | 4.8 s | 14.0 s | 1 | 1 | oui | 0 | statistiques |
| derivee#1 | mathematiques | complète | oui | 3 | 5.8 s | 8.5 s | 0 | 0 | oui | 0 | derivee |
| derivee#2 | mathematiques | complète | oui | 4 | 7.2 s | 11.3 s | 0 | 1 | oui | 0 | derivee |
| deux-des#1 | mathematiques | complète | oui | 3 | 3.7 s | 12.9 s | 0 | 0 | oui | 0 | probabilites |
| deux-des#2 | mathematiques | complète | oui | 3 | 5.0 s | 8.0 s | 0 | 1 | oui | 0 | probabilites |
| diff-carres#1 | mathematiques | complète | oui | 5 | 4.1 s | 14.7 s | 1 | 0 | oui | 0 | polynomes |
| diff-carres#2 | mathematiques | complète | oui | 4 | 6.1 s | 10.1 s | 0 | 0 | oui | 0 | polynomes |
| equation#1 | mathematiques | complète | oui | 5 | 3.2 s | 8.2 s | 0 | 0 | oui | 0 | algebre |
| equation#2 | mathematiques | complète | oui | 5 | 4.9 s | 9.3 s | 0 | 1 | oui | 0 | algebre |
| exponentielle#1 | mathematiques | complète | oui | 4 | 4.7 s | 8.2 s | 0 | 1 | **non** | 0 | algebre |
| exponentielle#2 | mathematiques | complète | oui | 4 | 7.8 s | 11.1 s | 0 | 1 | oui | 0 | algebre |
| inequation-erreur#1 | mathematiques | complète | oui | 3 | 4.6 s | 12.4 s | 0 | 1 | oui | 0 | algebre |
| inequation-erreur#2 | mathematiques | complète | oui | 4 | 12.1 s | 17.4 s | 0 | 0 | oui | 0 | algebre |
| interets-composes#1 | mathematiques | complète | oui | 4 | 9.4 s | 14.0 s | 1 | 0 | oui | 0 | finances |
| interets-composes#2 | mathematiques | complète | oui | 3 | 48.4 s | 52.2 s | 0 | 0 | oui | 0 | finances |
| loi-sinus-erreur#1 | mathematiques | complète | oui | 3 | 5.4 s | 11.3 s | 0 | 2 | oui | 4 | trigonometrie, geometrie |
| loi-sinus-erreur#2 | mathematiques | erreur invalid | **non** | 0 | — | 15.6 s | 1 | 0 | — | 0 | trigonometrie, geometrie |
| mediatrice#1 | mathematiques | complète | oui | 5 | 4.3 s | 12.1 s | 0 | 2 | oui | 0 | analytique, algebre |
| mediatrice#2 | mathematiques | complète | oui | 5 | 6.2 s | 12.4 s | 0 | 3 | oui | 0 | analytique, algebre |
| nombre-derive#1 | mathematiques | erreur invalid | **non** | 0 | — | 10.3 s | 2 | 0 | — | 0 | derivee, fonctions |
| nombre-derive#2 | mathematiques | complète | oui | 3 | 5.8 s | 8.2 s | 0 | 0 | oui | 0 | derivee, fonctions |
| proba-conditionnelle#1 | mathematiques | complète | oui | 5 | 10.6 s | 16.1 s | 1 | 0 | oui | 1 | probabilites |
| proba-conditionnelle#2 | mathematiques | complète | oui | 4 | 38.9 s | 59.1 s | 1 | 1 | oui | 0 | probabilites |
| programmation-lineaire#1 | mathematiques | erreur incomplete | **non** | 1 | 4.9 s | 14.3 s | 2 | 2 | **non** | 2 | aucun |
| programmation-lineaire#2 | mathematiques | complète | oui | 4 | 14.0 s | 19.5 s | 0 | 3 | oui | 0 | aucun |
| radian-sens#1 | mathematiques | complète | oui | 5 | 9.1 s | 14.2 s | 1 | 1 | oui | 0 | geometrie |
| radian-sens#2 | mathematiques | complète | oui | 4 | 9.3 s | 23.5 s | 0 | 1 | **non** | 0 | geometrie |
| regle-quadratique#1 | mathematiques | complète | oui | 4 | 13.0 s | 18.9 s | 0 | 2 | oui | 0 | fonctions |
| regle-quadratique#2 | mathematiques | complète | oui | 4 | 12.0 s | 33.1 s | 1 | 1 | oui | 0 | fonctions |
| systeme-comparaison-erreur#1 | mathematiques | complète | oui | 4 | 4.3 s | 11.3 s | 0 | 3 | **non** | 0 | systemes, algebre |
| systeme-comparaison-erreur#2 | mathematiques | complète | oui | 4 | 19.1 s | 22.6 s | 0 | 2 | **non** | 0 | systemes, algebre |
| trigo-rectangle#1 | mathematiques | complète | oui | 5 | 9.8 s | 18.1 s | 1 | 0 | oui | 0 | geometrie |
| trigo-rectangle#2 | mathematiques | complète | oui | 5 | 16.4 s | 42.7 s | 3 | 0 | oui | 1 | geometrie |
| valeur-absolue-equation#1 | mathematiques | complète | oui | 4 | 4.4 s | 10.6 s | 0 | 2 | oui | 0 | valeur_absolue, algebre |
| valeur-absolue-equation#2 | mathematiques | complète | oui | 5 | 4.3 s | 14.5 s | 0 | 0 | oui | 0 | valeur_absolue, algebre |
| vecteurs#1 | mathematiques | complète | oui | 4 | 5.9 s | 11.2 s | 0 | 0 | **non** | 0 | geometrie |
| vecteurs#2 | mathematiques | complète | oui | 4 | 4.5 s | 10.1 s | 0 | 0 | oui | 1 | geometrie |
| zeros#1 | mathematiques | complète | oui | 4 | 4.4 s | 10.9 s | 0 | 1 | oui | 0 | fonctions, polynomes |
| zeros#2 | mathematiques | complète | oui | 4 | 4.1 s | 10.1 s | 0 | 1 | oui | 0 | fonctions, polynomes |
