# Banc Nesalio — c3-deepseek

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 32 · leçons : 64 · lancé le 2026-11-09T19:53:33.679Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **62/64 (96.9 %)** |
| — dont chimie | 20/20 (100.0 %) |
| — dont mathematiques | 42/44 (95.5 %) |
| Issues | complète : 62 ; erreur incomplete : 2 |
| 1re tranche (médiane / max) | 4.5 s / 23.7 s |
| Durée totale (médiane / max) | 13.8 s / 36.3 s |
| Refus (corrections demandées) | 34 |
| Réparations sans appel | 62 |
| Lignes JSON illisibles | 5 |
| Appels au modèle | 97 |
| Réponse attendue écrite au tableau | 55/64 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 1135044, sortie 150729 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

**Atteint** : 96.9 % pour un seuil de 95 % (32 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 17
- JSON illisible : 10
- type ou champ manquant : 5
- clé inconnue : 4
- repère absent : 4
- leçon : erreur incomplete : 2
- nom inconnu dans une expression : 1
- identifiant invalide : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chimie-boyle-erreur#1 | chimie | complète | oui | 5 | 4.7 s | 17.1 s | 0 | 1 | oui | 0 | chimie_gaz |
| chimie-boyle-erreur#2 | chimie | complète | oui | 5 | 4.2 s | 15.4 s | 0 | 1 | oui | 0 | chimie_gaz |
| chimie-calorimetrie#1 | chimie | complète | oui | 5 | 4.8 s | 20.1 s | 1 | 0 | oui | 0 | chimie_energie |
| chimie-calorimetrie#2 | chimie | complète | oui | 4 | 2.7 s | 9.8 s | 0 | 1 | oui | 0 | chimie_energie |
| chimie-concentration#1 | chimie | complète | oui | 5 | 18.5 s | 29.9 s | 1 | 2 | **non** | 1 | chimie_concentration |
| chimie-concentration#2 | chimie | complète | oui | 4 | 2.9 s | 15.4 s | 2 | 0 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#1 | chimie | complète | oui | 4 | 12.2 s | 24.4 s | 0 | 1 | oui | 0 | chimie_concentration |
| chimie-dilution-erreur#2 | chimie | complète | oui | 5 | 2.9 s | 15.6 s | 1 | 1 | oui | 1 | chimie_concentration |
| chimie-equilibrer#1 | chimie | complète | oui | 5 | 3.7 s | 12.2 s | 0 | 2 | oui | 0 | chimie_balancement |
| chimie-equilibrer#2 | chimie | complète | oui | 5 | 3.6 s | 10.7 s | 0 | 2 | oui | 0 | chimie_balancement |
| chimie-gaz-parfaits#1 | chimie | complète | oui | 4 | 5.4 s | 14.3 s | 0 | 1 | oui | 0 | chimie_gaz, chimie_mole |
| chimie-gaz-parfaits#2 | chimie | complète | oui | 4 | 7.2 s | 13.1 s | 0 | 2 | oui | 0 | chimie_gaz, chimie_mole |
| chimie-hess#1 | chimie | complète | oui | 4 | 9.8 s | 19.3 s | 1 | 3 | oui | 1 | chimie_energie |
| chimie-hess#2 | chimie | complète | oui | 5 | 7.3 s | 16.4 s | 1 | 1 | oui | 2 | chimie_energie |
| chimie-kc#1 | chimie | complète | oui | 4 | 3.6 s | 10.5 s | 0 | 1 | oui | 1 | chimie_equilibre |
| chimie-kc#2 | chimie | complète | oui | 4 | 3.0 s | 9.9 s | 0 | 3 | oui | 0 | chimie_equilibre |
| chimie-mole#1 | chimie | complète | oui | 5 | 3.9 s | 12.1 s | 0 | 2 | oui | 0 | chimie_mole |
| chimie-mole#2 | chimie | complète | oui | 5 | 5.7 s | 13.9 s | 0 | 0 | oui | 0 | chimie_mole |
| chimie-stoechio#1 | chimie | complète | oui | 6 | 5.6 s | 31.3 s | 2 | 1 | **non** | 1 | chimie_stoechiometrie |
| chimie-stoechio#2 | chimie | complète | oui | 6 | 4.6 s | 13.4 s | 1 | 2 | oui | 0 | chimie_stoechiometrie |
| carre#1 | mathematiques | complète | oui | 5 | 3.4 s | 30.9 s | 1 | 1 | oui | 0 | polynomes |
| carre#2 | mathematiques | complète | oui | 6 | 3.1 s | 10.2 s | 0 | 2 | oui | 1 | polynomes |
| completion#1 | mathematiques | complète | oui | 5 | 2.4 s | 9.0 s | 0 | 1 | **non** | 1 | polynomes |
| completion#2 | mathematiques | complète | oui | 6 | 6.6 s | 18.0 s | 0 | 0 | oui | 0 | polynomes |
| correlation-sens#1 | mathematiques | complète | oui | 5 | 5.6 s | 12.9 s | 0 | 1 | oui | 0 | statistiques |
| correlation-sens#2 | mathematiques | complète | oui | 6 | 5.0 s | 20.0 s | 1 | 3 | oui | 0 | statistiques |
| derivee#1 | mathematiques | complète | oui | 5 | 16.1 s | 32.5 s | 1 | 0 | oui | 1 | derivee |
| derivee#2 | mathematiques | complète | oui | 4 | 6.2 s | 13.2 s | 0 | 1 | oui | 0 | derivee |
| deux-des#1 | mathematiques | complète | oui | 4 | 3.6 s | 8.0 s | 0 | 0 | oui | 0 | probabilites |
| deux-des#2 | mathematiques | complète | oui | 5 | 3.3 s | 12.2 s | 0 | 1 | oui | 0 | probabilites |
| diff-carres#1 | mathematiques | complète | oui | 4 | 3.9 s | 9.2 s | 0 | 0 | oui | 0 | polynomes |
| diff-carres#2 | mathematiques | complète | oui | 4 | 6.1 s | 11.5 s | 0 | 2 | oui | 1 | polynomes |
| equation#1 | mathematiques | complète | oui | 5 | 5.9 s | 16.9 s | 1 | 0 | oui | 0 | algebre |
| equation#2 | mathematiques | complète | oui | 4 | 4.3 s | 9.2 s | 0 | 0 | oui | 0 | algebre |
| exponentielle#1 | mathematiques | complète | oui | 4 | 5.8 s | 10.9 s | 0 | 2 | oui | 0 | algebre |
| exponentielle#2 | mathematiques | complète | oui | 4 | 3.7 s | 8.0 s | 0 | 0 | oui | 0 | algebre |
| inequation-erreur#1 | mathematiques | complète | oui | 5 | 2.6 s | 11.8 s | 0 | 2 | oui | 0 | algebre |
| inequation-erreur#2 | mathematiques | complète | oui | 5 | 3.0 s | 8.9 s | 0 | 1 | oui | 0 | algebre |
| interets-composes#1 | mathematiques | complète | oui | 5 | 10.2 s | 18.7 s | 1 | 0 | oui | 0 | finances |
| interets-composes#2 | mathematiques | complète | oui | 5 | 8.3 s | 18.7 s | 1 | 0 | oui | 0 | finances |
| loi-sinus-erreur#1 | mathematiques | complète | oui | 4 | 3.2 s | 6.8 s | 0 | 1 | oui | 12 | trigonometrie, geometrie |
| loi-sinus-erreur#2 | mathematiques | complète | oui | 4 | 13.4 s | 19.0 s | 0 | 2 | oui | 0 | trigonometrie, geometrie |
| mediatrice#1 | mathematiques | complète | oui | 6 | 3.9 s | 21.5 s | 1 | 2 | oui | 0 | analytique, algebre |
| mediatrice#2 | mathematiques | complète | oui | 6 | 14.5 s | 36.3 s | 2 | 2 | oui | 0 | analytique, algebre |
| nombre-derive#1 | mathematiques | complète | oui | 4 | 5.3 s | 13.7 s | 1 | 0 | oui | 2 | derivee, fonctions |
| nombre-derive#2 | mathematiques | complète | oui | 4 | 6.0 s | 11.6 s | 1 | 0 | oui | 0 | derivee, fonctions |
| proba-conditionnelle#1 | mathematiques | complète | oui | 5 | 7.9 s | 14.1 s | 0 | 0 | oui | 0 | probabilites |
| proba-conditionnelle#2 | mathematiques | complète | oui | 5 | 6.9 s | 22.9 s | 1 | 0 | oui | 2 | probabilites |
| programmation-lineaire#1 | mathematiques | erreur incomplete | **non** | 2 | 4.2 s | 27.4 s | 3 | 0 | **non** | 0 | aucun |
| programmation-lineaire#2 | mathematiques | complète | oui | 5 | 5.5 s | 17.2 s | 2 | 0 | oui | 0 | aucun |
| radian-sens#1 | mathematiques | complète | oui | 5 | 3.5 s | 11.0 s | 0 | 0 | oui | 0 | geometrie |
| radian-sens#2 | mathematiques | complète | oui | 4 | 3.4 s | 10.0 s | 0 | 0 | oui | 0 | geometrie |
| regle-quadratique#1 | mathematiques | complète | oui | 5 | 2.2 s | 8.9 s | 0 | 3 | oui | 0 | fonctions |
| regle-quadratique#2 | mathematiques | complète | oui | 5 | 3.8 s | 10.7 s | 0 | 1 | oui | 0 | fonctions |
| systeme-comparaison-erreur#1 | mathematiques | complète | oui | 5 | 3.7 s | 11.4 s | 0 | 0 | **non** | 0 | systemes, algebre |
| systeme-comparaison-erreur#2 | mathematiques | complète | oui | 5 | 23.7 s | 36.3 s | 1 | 1 | **non** | 0 | systemes, algebre |
| trigo-rectangle#1 | mathematiques | complète | oui | 5 | 10.6 s | 23.3 s | 2 | 0 | oui | 0 | geometrie |
| trigo-rectangle#2 | mathematiques | complète | oui | 4 | 3.3 s | 14.4 s | 1 | 1 | **non** | 0 | geometrie |
| valeur-absolue-equation#1 | mathematiques | complète | oui | 6 | 3.6 s | 13.6 s | 0 | 3 | oui | 0 | valeur_absolue, algebre |
| valeur-absolue-equation#2 | mathematiques | complète | oui | 5 | 19.3 s | 29.7 s | 0 | 1 | oui | 0 | valeur_absolue, algebre |
| vecteurs#1 | mathematiques | complète | oui | 4 | 3.5 s | 12.0 s | 0 | 0 | **non** | 0 | geometrie |
| vecteurs#2 | mathematiques | erreur incomplete | **non** | 3 | 3.8 s | 18.3 s | 3 | 0 | **non** | 0 | geometrie |
| zeros#1 | mathematiques | complète | oui | 4 | 5.8 s | 17.6 s | 0 | 1 | oui | 0 | fonctions, polynomes |
| zeros#2 | mathematiques | complète | oui | 4 | 2.9 s | 9.5 s | 0 | 0 | oui | 0 | fonctions, polynomes |
