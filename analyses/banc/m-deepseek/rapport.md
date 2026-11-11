# Banc Nesalio — m-deepseek

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 32 · leçons : 64 · lancé le 2026-11-09T16:28:07.156Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **57/64 (89.1 %)** |
| — dont chimie | 19/20 (95.0 %) |
| — dont mathematiques | 38/44 (86.4 %) |
| Issues | complète : 57 ; erreur incomplete : 6 ; erreur upstream : 1 |
| 1re tranche (médiane / max) | 6.1 s / 42.1 s |
| Durée totale (médiane / max) | 18.3 s / 169.4 s |
| Refus (corrections demandées) | 44 |
| Réparations sans appel | 50 |
| Lignes JSON illisibles | 4 |
| Appels au modèle | 102 |
| Réponse attendue écrite au tableau | 56/63 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 1193533, sortie 149018 |
| Coût approximatif | 0.5369 $ |

### Critère Q7 automatique (leçons intactes)

**Non atteint** : 89.1 % pour un seuil de 95 % (32 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 20
- type ou champ manquant : 10
- JSON illisible : 8
- leçon : erreur incomplete : 6
- clé inconnue : 5
- cible inconnue : 4
- identifiant invalide : 3
- tranche perdue sans refus : 2
- leçon : erreur upstream : 1
- repère absent : 1
- nom inconnu dans une expression : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chimie-boyle-erreur#1 | chimie | complète | oui | 4 | 32.8 s | 37.0 s | 1 | 1 | oui | 0 | chimie_gaz |
| chimie-boyle-erreur#2 | chimie | complète | oui | 4 | 4.8 s | 11.6 s | 0 | 0 | oui | 2 | chimie_gaz |
| chimie-calorimetrie#1 | chimie | erreur incomplete | **non** | 1 | 9.3 s | 25.9 s | 3 | 0 | **non** | 0 | chimie_energie |
| chimie-calorimetrie#2 | chimie | complète | oui | 4 | 3.7 s | 9.0 s | 0 | 0 | oui | 0 | chimie_energie |
| chimie-concentration#1 | chimie | complète | oui | 4 | 17.8 s | 35.8 s | 0 | 2 | oui | 0 | chimie_concentration |
| chimie-concentration#2 | chimie | complète | oui | 5 | 4.2 s | 10.8 s | 0 | 0 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#1 | chimie | complète | oui | 5 | 12.2 s | 41.8 s | 2 | 0 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#2 | chimie | complète | oui | 5 | 2.4 s | 10.7 s | 0 | 1 | oui | 1 | chimie_concentration |
| chimie-equilibrer#1 | chimie | complète | oui | 4 | 6.9 s | 13.4 s | 0 | 1 | oui | 0 | chimie_balancement |
| chimie-equilibrer#2 | chimie | complète | oui | 5 | 4.4 s | 12.8 s | 0 | 2 | oui | 0 | chimie_balancement |
| chimie-gaz-parfaits#1 | chimie | complète | oui | 5 | 5.1 s | 33.3 s | 0 | 0 | oui | 0 | chimie_gaz, chimie_mole |
| chimie-gaz-parfaits#2 | chimie | complète | oui | 4 | 3.7 s | 13.0 s | 0 | 1 | **non** | 1 | chimie_gaz, chimie_mole |
| chimie-hess#1 | chimie | complète | oui | 4 | 5.0 s | 9.5 s | 0 | 0 | oui | 0 | chimie_energie |
| chimie-hess#2 | chimie | complète | oui | 4 | 6.6 s | 11.4 s | 0 | 1 | oui | 0 | chimie_energie |
| chimie-kc#1 | chimie | complète | oui | 5 | 6.3 s | 12.8 s | 0 | 2 | oui | 0 | chimie_equilibre |
| chimie-kc#2 | chimie | complète | oui | 4 | 5.8 s | 13.5 s | 0 | 4 | oui | 0 | chimie_equilibre |
| chimie-mole#1 | chimie | complète | oui | 4 | 42.1 s | 55.2 s | 0 | 0 | oui | 0 | chimie_mole |
| chimie-mole#2 | chimie | complète | oui | 6 | 10.4 s | 20.9 s | 1 | 2 | oui | 1 | chimie_mole |
| chimie-stoechio#1 | chimie | complète | oui | 4 | 22.6 s | 28.2 s | 0 | 2 | oui | 0 | chimie_stoechiometrie |
| chimie-stoechio#2 | chimie | complète | oui | 6 | 3.7 s | 24.9 s | 2 | 1 | **non** | 1 | chimie_stoechiometrie |
| carre#1 | mathematiques | complète | oui | 4 | 2.6 s | 12.2 s | 0 | 0 | oui | 0 | polynomes |
| carre#2 | mathematiques | complète | oui | 4 | 5.5 s | 12.4 s | 0 | 0 | oui | 1 | polynomes |
| completion#1 | mathematiques | complète | oui | 5 | 6.6 s | 21.6 s | 1 | 0 | oui | 1 | polynomes |
| completion#2 | mathematiques | complète | oui | 5 | 3.2 s | 169.4 s | 0 | 1 | oui | 2 | polynomes |
| correlation-sens#1 | mathematiques | complète | oui | 5 | 6.6 s | 19.9 s | 0 | 1 | oui | 0 | statistiques |
| correlation-sens#2 | mathematiques | complète | oui | 4 | 8.8 s | 17.2 s | 0 | 0 | oui | 0 | statistiques |
| derivee#1 | mathematiques | complète | oui | 5 | 9.4 s | 13.0 s | 0 | 1 | oui | 1 | derivee |
| derivee#2 | mathematiques | complète | oui | 5 | 9.7 s | 13.3 s | 0 | 1 | oui | 0 | derivee |
| deux-des#1 | mathematiques | complète | oui | 4 | 5.2 s | 12.0 s | 0 | 2 | oui | 0 | probabilites |
| deux-des#2 | mathematiques | complète | oui | 4 | 4.0 s | 9.2 s | 0 | 0 | oui | 0 | probabilites |
| diff-carres#1 | mathematiques | complète | oui | 6 | 12.2 s | 28.1 s | 1 | 1 | oui | 1 | polynomes |
| diff-carres#2 | mathematiques | erreur upstream | **non** | 0 | — | 10.1 s | 0 | 0 | — | 0 | polynomes |
| equation#1 | mathematiques | complète | oui | 5 | 12.8 s | 19.7 s | 0 | 0 | oui | 0 | algebre |
| equation#2 | mathematiques | complète | oui | 5 | 19.0 s | 44.2 s | 2 | 0 | oui | 0 | algebre |
| exponentielle#1 | mathematiques | erreur incomplete | **non** | 2 | 2.9 s | 27.8 s | 3 | 1 | **non** | 0 | algebre |
| exponentielle#2 | mathematiques | complète | oui | 5 | 4.9 s | 10.2 s | 0 | 1 | oui | 0 | algebre |
| inequation-erreur#1 | mathematiques | erreur incomplete | **non** | 3 | 4.3 s | 14.9 s | 3 | 0 | oui | 0 | algebre |
| inequation-erreur#2 | mathematiques | complète | oui | 5 | 23.4 s | 30.7 s | 0 | 0 | oui | 0 | algebre |
| interets-composes#1 | mathematiques | erreur incomplete (perdue : s_calcul) | **non** | 3 | 4.9 s | 26.2 s | 4 | 0 | oui | 2 | finances |
| interets-composes#2 | mathematiques | complète | oui | 4 | 7.9 s | 14.3 s | 0 | 0 | oui | 0 | finances |
| loi-sinus-erreur#1 | mathematiques | complète | oui | 4 | 5.4 s | 26.1 s | 2 | 0 | oui | 0 | trigonometrie, geometrie |
| loi-sinus-erreur#2 | mathematiques | complète | oui | 4 | 15.2 s | 24.5 s | 0 | 1 | oui | 2 | trigonometrie, geometrie |
| mediatrice#1 | mathematiques | complète | oui | 6 | 4.6 s | 21.3 s | 0 | 1 | oui | 0 | analytique, algebre |
| mediatrice#2 | mathematiques | complète | oui | 5 | 10.3 s | 17.3 s | 0 | 4 | oui | 0 | analytique, algebre |
| nombre-derive#1 | mathematiques | complète | oui | 4 | 5.1 s | 11.4 s | 0 | 0 | oui | 0 | derivee, fonctions |
| nombre-derive#2 | mathematiques | complète | oui | 4 | 15.3 s | 19.4 s | 0 | 0 | oui | 1 | derivee, fonctions |
| proba-conditionnelle#1 | mathematiques | complète | oui | 5 | 13.3 s | 24.9 s | 1 | 1 | oui | 0 | probabilites |
| proba-conditionnelle#2 | mathematiques | complète | oui | 5 | 8.0 s | 17.3 s | 0 | 0 | oui | 0 | probabilites |
| programmation-lineaire#1 | mathematiques | erreur incomplete | **non** | 3 | 13.4 s | 52.2 s | 4 | 0 | **non** | 0 | aucun |
| programmation-lineaire#2 | mathematiques | complète | oui | 5 | 5.6 s | 23.0 s | 3 | 0 | oui | 2 | aucun |
| radian-sens#1 | mathematiques | complète | oui | 6 | 5.7 s | 22.3 s | 1 | 1 | oui | 0 | geometrie |
| radian-sens#2 | mathematiques | complète | oui | 5 | 6.1 s | 11.8 s | 0 | 1 | oui | 0 | geometrie |
| regle-quadratique#1 | mathematiques | complète | oui | 5 | 6.6 s | 16.5 s | 0 | 2 | oui | 1 | fonctions |
| regle-quadratique#2 | mathematiques | complète | oui | 6 | 5.0 s | 22.4 s | 1 | 2 | oui | 0 | fonctions |
| systeme-comparaison-erreur#1 | mathematiques | complète | oui | 5 | 5.0 s | 14.2 s | 1 | 0 | **non** | 0 | systemes, algebre |
| systeme-comparaison-erreur#2 | mathematiques | complète | oui | 4 | 4.7 s | 9.4 s | 0 | 0 | **non** | 0 | systemes, algebre |
| trigo-rectangle#1 | mathematiques | complète | oui | 5 | 6.0 s | 50.5 s | 2 | 4 | oui | 0 | geometrie |
| trigo-rectangle#2 | mathematiques | complète | oui | 4 | 16.3 s | 19.9 s | 0 | 0 | oui | 1 | geometrie |
| valeur-absolue-equation#1 | mathematiques | complète | oui | 5 | 3.8 s | 13.1 s | 0 | 0 | oui | 2 | valeur_absolue, algebre |
| valeur-absolue-equation#2 | mathematiques | complète | oui | 6 | 30.2 s | 58.1 s | 1 | 1 | oui | 0 | valeur_absolue, algebre |
| vecteurs#1 | mathematiques | complète | oui | 4 | 16.7 s | 36.5 s | 1 | 0 | oui | 0 | geometrie |
| vecteurs#2 | mathematiques | complète | oui | 5 | 3.3 s | 9.9 s | 0 | 1 | oui | 0 | geometrie |
| zeros#1 | mathematiques | complète | oui | 5 | 4.9 s | 12.4 s | 0 | 0 | oui | 0 | fonctions, polynomes |
| zeros#2 | mathematiques | erreur incomplete (perdue : s_retenir) | **non** | 4 | 16.6 s | 41.5 s | 4 | 2 | oui | 0 | fonctions, polynomes |
