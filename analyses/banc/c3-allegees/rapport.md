# Banc Nesalio — c3-allegees

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 32 · leçons : 64 · lancé le 2026-11-09T20:36:51.589Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **63/64 (98.4 %)** |
| — dont chimie | 19/20 (95.0 %) |
| — dont mathematiques | 44/44 (100.0 %) |
| Issues | complète : 63 ; erreur incomplete : 1 |
| 1re tranche (médiane / max) | 3.9 s / 13.8 s |
| Durée totale (médiane / max) | 11.8 s / 80.3 s |
| Refus (corrections demandées) | 30 |
| Réparations sans appel | 64 |
| Lignes JSON illisibles | 2 |
| Appels au modèle | 93 |
| Réponse attendue écrite au tableau | 54/64 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 1040249, sortie 140942 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

**Atteint** : 98.4 % pour un seuil de 95 % (32 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 15
- repère absent : 7
- type ou champ manquant : 5
- JSON illisible : 4
- clé inconnue : 3
- cible inconnue : 2
- identifiant invalide : 2
- leçon : erreur incomplete : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chimie-boyle-erreur#1 | chimie | complète | oui | 4 | 4.5 s | 11.7 s | 0 | 0 | oui | 3 | chimie_gaz |
| chimie-boyle-erreur#2 | chimie | complète | oui | 5 | 6.4 s | 17.0 s | 0 | 0 | oui | 0 | chimie_gaz |
| chimie-calorimetrie#1 | chimie | erreur incomplete | **non** | 1 | 6.1 s | 17.7 s | 3 | 0 | **non** | 0 | chimie_energie |
| chimie-calorimetrie#2 | chimie | complète | oui | 5 | 5.0 s | 11.9 s | 1 | 1 | oui | 0 | chimie_energie |
| chimie-concentration#1 | chimie | complète | oui | 4 | 1.8 s | 16.8 s | 2 | 2 | oui | 0 | chimie_concentration |
| chimie-concentration#2 | chimie | complète | oui | 4 | 3.4 s | 10.9 s | 0 | 2 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#1 | chimie | complète | oui | 5 | 3.1 s | 13.4 s | 1 | 1 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#2 | chimie | complète | oui | 5 | 4.4 s | 12.7 s | 1 | 0 | **non** | 0 | chimie_concentration |
| chimie-equilibrer#1 | chimie | complète | oui | 5 | 6.1 s | 12.7 s | 0 | 1 | oui | 0 | chimie_balancement |
| chimie-equilibrer#2 | chimie | complète | oui | 4 | 5.6 s | 10.5 s | 0 | 2 | oui | 0 | chimie_balancement |
| chimie-gaz-parfaits#1 | chimie | complète | oui | 5 | 4.8 s | 11.3 s | 0 | 1 | **non** | 0 | chimie_gaz, chimie_mole |
| chimie-gaz-parfaits#2 | chimie | complète | oui | 5 | 4.4 s | 11.2 s | 0 | 2 | **non** | 0 | chimie_gaz, chimie_mole |
| chimie-hess#1 | chimie | complète | oui | 4 | 3.9 s | 80.3 s | 0 | 1 | oui | 2 | chimie_energie |
| chimie-hess#2 | chimie | complète | oui | 4 | 4.9 s | 10.6 s | 0 | 1 | oui | 0 | chimie_energie |
| chimie-kc#1 | chimie | complète | oui | 4 | 9.0 s | 9.6 s | 0 | 2 | oui | 0 | chimie_equilibre |
| chimie-kc#2 | chimie | complète | oui | 4 | 2.8 s | 10.0 s | 0 | 2 | oui | 0 | chimie_equilibre |
| chimie-mole#1 | chimie | complète | oui | 5 | 7.7 s | 20.9 s | 1 | 0 | oui | 0 | chimie_mole |
| chimie-mole#2 | chimie | complète | oui | 5 | 2.9 s | 9.5 s | 0 | 1 | oui | 1 | chimie_mole |
| chimie-stoechio#1 | chimie | complète | oui | 6 | 3.5 s | 16.8 s | 1 | 1 | oui | 0 | chimie_stoechiometrie |
| chimie-stoechio#2 | chimie | complète | oui | 3 | 3.4 s | 20.2 s | 2 | 1 | **non** | 0 | chimie_stoechiometrie |
| carre#1 | mathematiques | complète | oui | 5 | 2.8 s | 12.0 s | 1 | 0 | oui | 1 | polynomes |
| carre#2 | mathematiques | complète | oui | 4 | 3.6 s | 11.6 s | 0 | 0 | oui | 0 | polynomes |
| completion#1 | mathematiques | complète | oui | 5 | 3.4 s | 11.9 s | 0 | 0 | oui | 1 | polynomes |
| completion#2 | mathematiques | complète | oui | 4 | 4.7 s | 10.4 s | 0 | 0 | oui | 0 | polynomes |
| correlation-sens#1 | mathematiques | complète | oui | 5 | 9.5 s | 17.1 s | 0 | 2 | oui | 1 | statistiques |
| correlation-sens#2 | mathematiques | complète | oui | 5 | 6.6 s | 11.9 s | 0 | 0 | oui | 0 | statistiques |
| derivee#1 | mathematiques | complète | oui | 5 | 5.4 s | 10.3 s | 1 | 0 | oui | 0 | derivee |
| derivee#2 | mathematiques | complète | oui | 4 | 3.7 s | 12.7 s | 0 | 0 | oui | 0 | derivee |
| deux-des#1 | mathematiques | complète | oui | 4 | 4.1 s | 9.6 s | 0 | 1 | oui | 0 | probabilites |
| deux-des#2 | mathematiques | complète | oui | 4 | 3.1 s | 7.2 s | 0 | 2 | oui | 0 | probabilites |
| diff-carres#1 | mathematiques | complète | oui | 5 | 2.7 s | 12.9 s | 1 | 0 | oui | 1 | polynomes |
| diff-carres#2 | mathematiques | complète | oui | 4 | 3.8 s | 9.7 s | 0 | 2 | oui | 1 | polynomes |
| equation#1 | mathematiques | complète | oui | 5 | 2.2 s | 6.3 s | 0 | 1 | oui | 0 | algebre |
| equation#2 | mathematiques | complète | oui | 5 | 5.2 s | 13.3 s | 2 | 0 | oui | 0 | algebre |
| exponentielle#1 | mathematiques | complète | oui | 4 | 3.5 s | 7.1 s | 0 | 0 | oui | 0 | algebre |
| exponentielle#2 | mathematiques | complète | oui | 5 | 2.0 s | 9.0 s | 0 | 1 | oui | 0 | algebre |
| inequation-erreur#1 | mathematiques | complète | oui | 5 | 3.1 s | 6.6 s | 0 | 0 | oui | 1 | algebre |
| inequation-erreur#2 | mathematiques | complète | oui | 4 | 5.1 s | 9.9 s | 0 | 2 | oui | 0 | algebre |
| interets-composes#1 | mathematiques | complète | oui | 4 | 5.8 s | 10.3 s | 0 | 1 | oui | 0 | finances |
| interets-composes#2 | mathematiques | complète | oui | 5 | 3.7 s | 17.8 s | 2 | 1 | oui | 0 | finances |
| loi-sinus-erreur#1 | mathematiques | complète | oui | 4 | 5.7 s | 13.8 s | 0 | 1 | **non** | 2 | trigonometrie, geometrie |
| loi-sinus-erreur#2 | mathematiques | complète | oui | 4 | 5.1 s | 12.3 s | 0 | 0 | **non** | 0 | trigonometrie, geometrie |
| mediatrice#1 | mathematiques | complète | oui | 6 | 3.4 s | 14.9 s | 1 | 1 | oui | 0 | analytique, algebre |
| mediatrice#2 | mathematiques | complète | oui | 6 | 2.9 s | 13.1 s | 0 | 4 | oui | 0 | analytique, algebre |
| nombre-derive#1 | mathematiques | complète | oui | 4 | 3.3 s | 9.2 s | 0 | 0 | oui | 0 | derivee, fonctions |
| nombre-derive#2 | mathematiques | complète | oui | 5 | 10.4 s | 18.0 s | 1 | 0 | oui | 0 | derivee, fonctions |
| proba-conditionnelle#1 | mathematiques | complète | oui | 4 | 6.5 s | 14.1 s | 0 | 2 | oui | 0 | probabilites |
| proba-conditionnelle#2 | mathematiques | complète | oui | 4 | 5.0 s | 10.8 s | 0 | 1 | oui | 3 | probabilites |
| programmation-lineaire#1 | mathematiques | complète | oui | 4 | 7.0 s | 11.4 s | 0 | 0 | oui | 0 | aucun |
| programmation-lineaire#2 | mathematiques | complète | oui | 5 | 6.3 s | 15.5 s | 1 | 1 | oui | 0 | aucun |
| radian-sens#1 | mathematiques | complète | oui | 4 | 13.8 s | 14.7 s | 1 | 0 | oui | 0 | geometrie |
| radian-sens#2 | mathematiques | complète | oui | 5 | 3.0 s | 9.9 s | 0 | 3 | **non** | 0 | geometrie |
| regle-quadratique#1 | mathematiques | complète | oui | 5 | 2.1 s | 6.4 s | 0 | 3 | oui | 0 | fonctions |
| regle-quadratique#2 | mathematiques | complète | oui | 5 | 3.6 s | 13.3 s | 0 | 4 | oui | 0 | fonctions |
| systeme-comparaison-erreur#1 | mathematiques | complète | oui | 5 | 3.6 s | 10.4 s | 0 | 0 | **non** | 0 | systemes, algebre |
| systeme-comparaison-erreur#2 | mathematiques | complète | oui | 5 | 2.9 s | 11.5 s | 0 | 0 | **non** | 0 | systemes, algebre |
| trigo-rectangle#1 | mathematiques | complète | oui | 4 | 5.5 s | 9.1 s | 1 | 1 | oui | 0 | geometrie |
| trigo-rectangle#2 | mathematiques | complète | oui | 4 | 2.1 s | 4.6 s | 0 | 2 | oui | 0 | geometrie |
| valeur-absolue-equation#1 | mathematiques | complète | oui | 5 | 3.2 s | 9.5 s | 0 | 1 | oui | 0 | valeur_absolue, algebre |
| valeur-absolue-equation#2 | mathematiques | complète | oui | 5 | 3.4 s | 10.3 s | 0 | 3 | oui | 0 | valeur_absolue, algebre |
| vecteurs#1 | mathematiques | complète | oui | 5 | 4.9 s | 12.3 s | 1 | 2 | oui | 0 | geometrie |
| vecteurs#2 | mathematiques | complète | oui | 4 | 3.9 s | 29.8 s | 3 | 0 | oui | 0 | geometrie |
| zeros#1 | mathematiques | complète | oui | 6 | 3.5 s | 17.8 s | 1 | 0 | oui | 3 | fonctions, polynomes |
| zeros#2 | mathematiques | complète | oui | 4 | 8.4 s | 15.4 s | 1 | 1 | oui | 0 | fonctions, polynomes |
