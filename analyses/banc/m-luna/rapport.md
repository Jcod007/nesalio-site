# Banc Nesalio — m-luna

Modèle : `openai/gpt-6-luna` · tirages : 2 · questions : 32 · leçons : 64 · lancé le 2026-11-09T16:28:08.000Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **50/64 (78.1 %)** |
| — dont chimie | 16/20 (80.0 %) |
| — dont mathematiques | 34/44 (77.3 %) |
| Issues | complète : 51 ; erreur upstream : 7 ; erreur incomplete : 6 |
| 1re tranche (médiane / max) | 6.9 s / 130.3 s |
| Durée totale (médiane / max) | 25.6 s / 154.6 s |
| Refus (corrections demandées) | 52 |
| Réparations sans appel | 24 |
| Lignes JSON illisibles | 15 |
| Appels au modèle | 111 |
| Réponse attendue écrite au tableau | 52/59 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 1300782, sortie 204638 |
| Coût approximatif | 0.2324 $ |

### Critère Q7 automatique (leçons intactes)

**Non atteint** : 78.1 % pour un seuil de 95 % (32 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- JSON illisible : 28
- autre : 20
- type ou champ manquant : 11
- identifiant invalide : 8
- leçon : erreur upstream : 7
- leçon : erreur incomplete : 6
- repère absent : 5
- clé inconnue : 2
- tranche perdue sans refus : 2
- cible inconnue : 2
- leçon entière invalide : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chimie-boyle-erreur#1 | chimie | complète | oui | 4 | 5.3 s | 25.8 s | 1 | 0 | oui | 1 | chimie_gaz |
| chimie-boyle-erreur#2 | chimie | complète | oui | 4 | 8.3 s | 19.6 s | 1 | 0 | oui | 0 | chimie_gaz |
| chimie-calorimetrie#1 | chimie | erreur upstream | **non** | 0 | — | 4.1 s | 0 | 0 | — | 0 | chimie_energie |
| chimie-calorimetrie#2 | chimie | complète | oui | 4 | 5.5 s | 19.3 s | 0 | 1 | oui | 0 | chimie_energie |
| chimie-concentration#1 | chimie | complète | oui | 5 | 5.3 s | 42.3 s | 0 | 0 | oui | 0 | chimie_concentration |
| chimie-concentration#2 | chimie | complète | oui | 4 | 14.3 s | 32.2 s | 2 | 2 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#1 | chimie | complète | oui | 4 | 10.2 s | 19.6 s | 0 | 0 | **non** | 0 | chimie_concentration |
| chimie-dilution-erreur#2 | chimie | complète | oui | 4 | 6.8 s | 30.1 s | 1 | 0 | oui | 0 | chimie_concentration |
| chimie-equilibrer#1 | chimie | erreur incomplete (perdue : s_oxygene_verification) | **non** | 2 | 4.2 s | 28.2 s | 3 | 1 | **non** | 0 | chimie_balancement |
| chimie-equilibrer#2 | chimie | erreur incomplete (perdue : s_carbone_hydrogene) | **non** | 1 | 10.4 s | 27.5 s | 3 | 1 | **non** | 0 | chimie_balancement |
| chimie-gaz-parfaits#1 | chimie | complète | oui | 4 | 4.2 s | 16.1 s | 0 | 0 | oui | 0 | chimie_gaz, chimie_mole |
| chimie-gaz-parfaits#2 | chimie | complète | oui | 4 | 6.4 s | 22.9 s | 0 | 0 | oui | 1 | chimie_gaz, chimie_mole |
| chimie-hess#1 | chimie | complète | oui | 4 | 5.9 s | 35.2 s | 0 | 2 | oui | 0 | chimie_energie |
| chimie-hess#2 | chimie | complète | oui | 3 | 14.5 s | 23.5 s | 1 | 2 | oui | 0 | chimie_energie |
| chimie-kc#1 | chimie | complète | oui | 4 | 5.1 s | 22.8 s | 1 | 2 | oui | 0 | chimie_equilibre |
| chimie-kc#2 | chimie | complète | oui | 5 | 4.2 s | 16.8 s | 0 | 2 | oui | 0 | chimie_equilibre |
| chimie-mole#1 | chimie | complète | oui | 4 | 4.8 s | 15.2 s | 0 | 0 | oui | 0 | chimie_mole |
| chimie-mole#2 | chimie | complète | oui | 5 | 4.1 s | 24.1 s | 1 | 0 | oui | 0 | chimie_mole |
| chimie-stoechio#1 | chimie | erreur incomplete | **non** | 2 | 23.8 s | 39.6 s | 4 | 0 | oui | 0 | chimie_stoechiometrie |
| chimie-stoechio#2 | chimie | complète | oui | 4 | 6.1 s | 30.3 s | 2 | 0 | oui | 1 | chimie_stoechiometrie |
| carre#1 | mathematiques | complète | oui | 5 | 5.1 s | 37.0 s | 1 | 0 | oui | 0 | polynomes |
| carre#2 | mathematiques | complète | oui | 4 | 4.6 s | 20.7 s | 0 | 0 | oui | 1 | polynomes |
| completion#1 | mathematiques | complète | oui | 4 | 3.9 s | 21.0 s | 0 | 1 | oui | 0 | polynomes |
| completion#2 | mathematiques | complète | oui | 4 | 5.1 s | 18.9 s | 0 | 0 | oui | 0 | polynomes |
| correlation-sens#1 | mathematiques | erreur incomplete | **non** | 4 | 8.8 s | 37.1 s | 1 | 1 | oui | 0 | statistiques |
| correlation-sens#2 | mathematiques | complète | oui | 4 | 10.4 s | 32.9 s | 0 | 2 | oui | 0 | statistiques |
| derivee#1 | mathematiques | complète | oui | 4 | 5.7 s | 42.5 s | 0 | 0 | oui | 0 | derivee |
| derivee#2 | mathematiques | complète | oui | 4 | 8.9 s | 22.8 s | 0 | 1 | oui | 1 | derivee |
| deux-des#1 | mathematiques | complète | oui | 4 | 67.3 s | 99.1 s | 0 | 0 | oui | 0 | probabilites |
| deux-des#2 | mathematiques | complète | oui | 4 | 3.8 s | 12.7 s | 0 | 0 | oui | 0 | probabilites |
| diff-carres#1 | mathematiques | complète | oui | 4 | 5.2 s | 18.6 s | 0 | 0 | oui | 1 | polynomes |
| diff-carres#2 | mathematiques | complète | oui | 4 | 5.1 s | 21.9 s | 1 | 0 | oui | 0 | polynomes |
| equation#1 | mathematiques | complète | oui | 3 | 14.8 s | 19.5 s | 1 | 0 | oui | 0 | algebre |
| equation#2 | mathematiques | erreur upstream | **non** | 3 | 7.5 s | 107.9 s | 0 | 0 | oui | 0 | algebre |
| exponentielle#1 | mathematiques | erreur upstream | **non** | 0 | — | 36.4 s | 0 | 0 | — | 0 | algebre |
| exponentielle#2 | mathematiques | erreur upstream | **non** | 0 | — | 3.0 s | 0 | 0 | — | 0 | algebre |
| inequation-erreur#1 | mathematiques | complète | oui | 4 | 130.3 s | 154.6 s | 2 | 0 | oui | 1 | algebre |
| inequation-erreur#2 | mathematiques | erreur upstream | **non** | 0 | — | 3.0 s | 0 | 0 | — | 0 | algebre |
| interets-composes#1 | mathematiques | complète | oui | 4 | 9.5 s | 24.8 s | 1 | 0 | oui | 0 | finances |
| interets-composes#2 | mathematiques | complète | oui | 4 | 7.4 s | 27.2 s | 1 | 0 | oui | 0 | finances |
| loi-sinus-erreur#1 | mathematiques | erreur upstream | **non** | 5 | 8.7 s | 153.7 s | 0 | 0 | **non** | 1 | trigonometrie, geometrie |
| loi-sinus-erreur#2 | mathematiques | complète | oui | 5 | 8.7 s | 40.2 s | 2 | 1 | oui | 1 | trigonometrie, geometrie |
| mediatrice#1 | mathematiques | complète | oui | 5 | 9.1 s | 39.9 s | 1 | 0 | oui | 3 | analytique, algebre |
| mediatrice#2 | mathematiques | complète | oui | 5 | 5.1 s | 22.6 s | 0 | 0 | oui | 1 | analytique, algebre |
| nombre-derive#1 | mathematiques | erreur upstream | **non** | 0 | — | 10.9 s | 0 | 0 | — | 0 | derivee, fonctions |
| nombre-derive#2 | mathematiques | complète | oui | 4 | 10.4 s | 49.8 s | 0 | 0 | oui | 2 | derivee, fonctions |
| proba-conditionnelle#1 | mathematiques | complète | oui | 4 | 8.6 s | 37.9 s | 2 | 0 | oui | 1 | probabilites |
| proba-conditionnelle#2 | mathematiques | complète | oui | 4 | 6.9 s | 26.9 s | 1 | 0 | oui | 1 | probabilites |
| programmation-lineaire#1 | mathematiques | erreur incomplete | **non** | 2 | 8.0 s | 60.4 s | 4 | 0 | **non** | 0 | aucun |
| programmation-lineaire#2 | mathematiques | complète | oui | 3 | 9.0 s | 15.9 s | 0 | 0 | oui | 1 | aucun |
| radian-sens#1 | mathematiques | complète | **non** | 5 | 5.4 s | 24.9 s | 1 | 0 | oui | 0 | geometrie |
| radian-sens#2 | mathematiques | complète | oui | 4 | 13.9 s | 25.4 s | 1 | 0 | oui | 0 | geometrie |
| regle-quadratique#1 | mathematiques | complète | oui | 5 | 7.0 s | 30.3 s | 1 | 0 | oui | 0 | fonctions |
| regle-quadratique#2 | mathematiques | complète | oui | 4 | 6.0 s | 24.9 s | 1 | 0 | oui | 0 | fonctions |
| systeme-comparaison-erreur#1 | mathematiques | complète | oui | 4 | 37.4 s | 51.8 s | 1 | 1 | **non** | 0 | systemes, algebre |
| systeme-comparaison-erreur#2 | mathematiques | complète | oui | 4 | 6.6 s | 20.4 s | 0 | 0 | **non** | 0 | systemes, algebre |
| trigo-rectangle#1 | mathematiques | complète | oui | 4 | 10.1 s | 34.7 s | 2 | 0 | oui | 0 | geometrie |
| trigo-rectangle#2 | mathematiques | complète | oui | 4 | 10.4 s | 21.8 s | 1 | 0 | oui | 0 | geometrie |
| valeur-absolue-equation#1 | mathematiques | complète | oui | 4 | 6.6 s | 19.3 s | 0 | 0 | oui | 2 | valeur_absolue, algebre |
| valeur-absolue-equation#2 | mathematiques | complète | oui | 4 | 6.3 s | 18.4 s | 0 | 0 | oui | 0 | valeur_absolue, algebre |
| vecteurs#1 | mathematiques | complète | oui | 3 | 34.9 s | 37.4 s | 0 | 0 | oui | 1 | geometrie |
| vecteurs#2 | mathematiques | complète | oui | 4 | 5.0 s | 36.1 s | 2 | 2 | oui | 0 | geometrie |
| zeros#1 | mathematiques | complète | oui | 4 | 49.8 s | 71.2 s | 1 | 0 | oui | 0 | fonctions, polynomes |
| zeros#2 | mathematiques | erreur incomplete | **non** | 2 | 6.7 s | 34.6 s | 3 | 2 | oui | 4 | fonctions, polynomes |
