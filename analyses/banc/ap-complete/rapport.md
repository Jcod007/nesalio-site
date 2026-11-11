# Banc Nesalio — ap-complete

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 35 · leçons : 70 · lancé le 2026-11-09T21:17:19.438Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **48/70 (68.6 %)** |
| — dont chimie | 13/26 (50.0 %) |
| — dont mathematiques | 35/44 (79.5 %) |
| Issues | complète : 48 ; erreur upstream : 16 ; erreur incomplete : 6 |
| 1re tranche (médiane / max) | 5.5 s / 21.0 s |
| Durée totale (médiane / max) | 14.6 s / 40.4 s |
| Refus (corrections demandées) | 53 |
| Réparations sans appel | 29 |
| Lignes JSON illisibles | 9 |
| Appels au modèle | 118 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 1414551, sortie 140525 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

**Non atteint** : 68.6 % pour un seuil de 95 % (35 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 24
- JSON illisible : 18
- leçon : erreur upstream : 16
- type ou champ manquant : 8
- leçon : erreur incomplete : 6
- clé inconnue : 6
- identifiant invalide : 5
- repère absent : 4
- nom inconnu dans une expression : 4
- tranche perdue sans refus : 2

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-bicarbonate-vinaigre#1 | chimie | complète | oui | 4 | 5.2 s | 8.8 s | 0 | 1 | — | 0 | chimie_acides, chimie_balancement |
| ap-bicarbonate-vinaigre#2 | chimie | erreur upstream | **non** | 0 | — | 2.9 s | 0 | 0 | — | 0 | chimie_acides, chimie_balancement |
| ap-complexe-active#1 | chimie | complète | oui | 4 | 4.8 s | 9.6 s | 0 | 0 | — | 0 | chimie_energie |
| ap-complexe-active#2 | chimie | erreur upstream | **non** | 0 | — | 0.7 s | 0 | 0 | — | 0 | chimie_energie |
| ap-endo-exo#1 | chimie | complète | oui | 5 | 3.8 s | 25.8 s | 1 | 1 | — | 1 | aucun |
| ap-endo-exo#2 | chimie | erreur upstream | **non** | 0 | — | 8.7 s | 0 | 0 | — | 0 | aucun |
| ap-equilibrer#1 | chimie | complète | oui | 5 | 2.4 s | 9.6 s | 0 | 2 | — | 0 | chimie_balancement |
| ap-equilibrer#2 | chimie | erreur upstream | **non** | 0 | — | 0.6 s | 0 | 0 | — | 0 | chimie_balancement |
| ap-isoler-temperature#1 | chimie | complète | oui | 4 | 4.6 s | 7.9 s | 0 | 0 | — | 0 | algebre |
| ap-isoler-temperature#2 | chimie | erreur upstream | **non** | 0 | — | 1.3 s | 0 | 0 | — | 0 | algebre |
| ap-kc-donnee-manquante#1 | chimie | complète | oui | 6 | 2.9 s | 11.3 s | 0 | 2 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kc-donnee-manquante#2 | chimie | erreur upstream | **non** | 0 | — | 0.5 s | 0 | 0 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kps-solubilite#1 | chimie | complète | oui | 5 | 2.1 s | 11.2 s | 0 | 1 | — | 0 | chimie_equilibre, chimie_acides |
| ap-kps-solubilite#2 | chimie | erreur upstream | **non** | 0 | — | 0.4 s | 0 | 0 | — | 0 | chimie_equilibre, chimie_acides |
| ap-loi-hess#1 | chimie | complète | oui | 5 | 4.3 s | 27.6 s | 0 | 2 | — | 5 | chimie_energie |
| ap-loi-hess#2 | chimie | erreur upstream | **non** | 0 | — | 0.4 s | 0 | 0 | — | 0 | chimie_energie |
| ap-ph-log#1 | chimie | complète | oui | 5 | 21.0 s | 38.4 s | 1 | 0 | — | 0 | chimie_acides, chimie_concentration |
| ap-ph-log#2 | chimie | erreur upstream | **non** | 0 | — | 0.5 s | 0 | 0 | — | 0 | chimie_acides, chimie_concentration |
| ap-ppm-mol#1 | chimie | complète | oui | 4 | 5.9 s | 34.3 s | 0 | 0 | — | 1 | chimie_concentration |
| ap-ppm-mol#2 | chimie | erreur upstream | **non** | 0 | — | 1.0 s | 0 | 0 | — | 0 | chimie_concentration |
| ap-reactif-limitant#1 | chimie | complète | oui | 5 | 2.9 s | 18.5 s | 0 | 1 | — | 0 | chimie_mole |
| ap-reactif-limitant#2 | chimie | erreur upstream | **non** | 0 | — | 0.6 s | 0 | 0 | — | 0 | chimie_mole |
| ap-solubilite-g-mol#1 | chimie | complète | oui | 4 | 9.1 s | 20.5 s | 2 | 2 | — | 0 | chimie_concentration |
| ap-solubilite-g-mol#2 | chimie | erreur upstream | **non** | 0 | — | 0.6 s | 0 | 0 | — | 0 | chimie_concentration |
| ap-vitesse-ordre-2#1 | chimie | complète | oui | 4 | 7.2 s | 9.3 s | 0 | 0 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-vitesse-ordre-2#2 | chimie | erreur upstream | **non** | 0 | — | 8.9 s | 0 | 0 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-correlation-force#1 | mathematiques | erreur incomplete (perdue : s_forces) | **non** | 2 | 6.0 s | 37.6 s | 4 | 0 | — | 6 | statistiques |
| ap-correlation-force#2 | mathematiques | complète | oui | 6 | 14.4 s | 36.3 s | 1 | 0 | — | 0 | statistiques |
| ap-correlation-tableau#1 | mathematiques | complète | oui | 5 | 7.9 s | 22.9 s | 1 | 2 | — | 1 | statistiques |
| ap-correlation-tableau#2 | mathematiques | complète | oui | 6 | 5.5 s | 16.7 s | 0 | 0 | — | 0 | statistiques |
| ap-ellipse-b#1 | mathematiques | complète | oui | 4 | 3.2 s | 11.3 s | 1 | 0 | — | 0 | aucun |
| ap-ellipse-b#2 | mathematiques | erreur upstream | **non** | 0 | — | 0.7 s | 0 | 0 | — | 0 | aucun |
| ap-exponentielle-bases#1 | mathematiques | complète | oui | 5 | 7.0 s | 23.3 s | 1 | 1 | — | 0 | aucun |
| ap-exponentielle-bases#2 | mathematiques | complète | oui | 5 | 3.4 s | 14.1 s | 0 | 1 | — | 0 | aucun |
| ap-factoriser-cubique#1 | mathematiques | complète | oui | 5 | 4.4 s | 21.8 s | 1 | 0 | — | 0 | polynomes |
| ap-factoriser-cubique#2 | mathematiques | complète | oui | 5 | 8.3 s | 18.0 s | 1 | 0 | — | 0 | polynomes |
| ap-forme-generale#1 | mathematiques | complète | oui | 5 | 3.2 s | 9.3 s | 0 | 0 | — | 0 | fonctions, algebre |
| ap-forme-generale#2 | mathematiques | erreur upstream | **non** | 2 | 2.9 s | 12.4 s | 1 | 0 | — | 0 | fonctions, algebre |
| ap-graphes-chemin#1 | mathematiques | complète | oui | 4 | 7.9 s | 26.4 s | 3 | 0 | — | 6 | aucun |
| ap-graphes-chemin#2 | mathematiques | complète | oui | 5 | 7.9 s | 16.3 s | 0 | 2 | — | 2 | aucun |
| ap-inequation-valeur-absolue#1 | mathematiques | erreur incomplete (perdue : s_regle) | **non** | 4 | 4.9 s | 30.1 s | 4 | 0 | — | 0 | valeur_absolue, fonctions |
| ap-inequation-valeur-absolue#2 | mathematiques | complète | oui | 5 | 5.5 s | 17.1 s | 0 | 0 | — | 2 | valeur_absolue, fonctions |
| ap-mediane#1 | mathematiques | complète | oui | 5 | 7.7 s | 17.1 s | 0 | 0 | — | 1 | statistiques |
| ap-mediane#2 | mathematiques | complète | oui | 6 | 5.3 s | 29.2 s | 2 | 1 | — | 0 | statistiques |
| ap-parabole-foyer#1 | mathematiques | complète | oui | 4 | 4.6 s | 9.0 s | 0 | 1 | — | 0 | fonctions |
| ap-parabole-foyer#2 | mathematiques | erreur upstream | **non** | 1 | 1.5 s | 4.8 s | 1 | 0 | — | 0 | fonctions |
| ap-pente-un-point#1 | mathematiques | erreur incomplete | **non** | 3 | 10.0 s | 31.8 s | 4 | 0 | — | 1 | analytique, polynomes |
| ap-pente-un-point#2 | mathematiques | complète | oui | 4 | 7.2 s | 15.0 s | 0 | 1 | — | 0 | analytique, polynomes |
| ap-periodique-periode#1 | mathematiques | complète | oui | 4 | 4.6 s | 9.0 s | 0 | 0 | — | 1 | fonctions |
| ap-periodique-periode#2 | mathematiques | complète | oui | 4 | 14.9 s | 20.9 s | 2 | 0 | — | 1 | fonctions |
| ap-perpendiculaire-point#1 | mathematiques | complète | oui | 5 | 5.4 s | 11.3 s | 0 | 2 | — | 0 | analytique, algebre |
| ap-perpendiculaire-point#2 | mathematiques | complète | oui | 5 | 4.4 s | 15.0 s | 0 | 0 | — | 1 | analytique, algebre |
| ap-polygone-contraintes#1 | mathematiques | complète | oui | 4 | 3.3 s | 31.7 s | 3 | 0 | — | 0 | algebre |
| ap-polygone-contraintes#2 | mathematiques | complète | oui | 5 | 3.0 s | 13.6 s | 1 | 1 | — | 0 | algebre |
| ap-proba-conditionnelle-venn#1 | mathematiques | complète | oui | 5 | 7.3 s | 23.2 s | 0 | 0 | — | 0 | probabilites |
| ap-proba-conditionnelle-venn#2 | mathematiques | complète | oui | 5 | 9.8 s | 16.8 s | 0 | 0 | — | 9 | probabilites |
| ap-quadratique-table#1 | mathematiques | complète | oui | 6 | 5.9 s | 19.8 s | 1 | 0 | — | 0 | fonctions, polynomes |
| ap-quadratique-table#2 | mathematiques | complète | oui | 5 | 6.7 s | 13.2 s | 0 | 1 | — | 0 | fonctions, polynomes |
| ap-regle-majorite#1 | mathematiques | complète | oui | 5 | 8.8 s | 22.2 s | 2 | 1 | — | 1 | aucun |
| ap-regle-majorite#2 | mathematiques | complète | oui | 4 | 6.4 s | 15.5 s | 1 | 0 | — | 0 | aucun |
| ap-sinus-cosinus#1 | mathematiques | complète | oui | 4 | 6.0 s | 15.2 s | 0 | 0 | — | 0 | fonctions, geometrie |
| ap-sinus-cosinus#2 | mathematiques | complète | oui | 4 | 4.8 s | 11.0 s | 0 | 0 | — | 1 | fonctions, geometrie |
| ap-systeme-produit#1 | mathematiques | complète | oui | 6 | 14.7 s | 40.4 s | 2 | 0 | — | 1 | aucun |
| ap-systeme-produit#2 | mathematiques | erreur incomplete | **non** | 3 | 3.4 s | 39.5 s | 4 | 0 | — | 0 | aucun |
| ap-trigo-rectangle#1 | mathematiques | complète | oui | 4 | 3.9 s | 9.5 s | 0 | 0 | — | 0 | fonctions, geometrie |
| ap-trigo-rectangle#2 | mathematiques | complète | oui | 4 | 10.0 s | 13.4 s | 0 | 0 | — | 2 | fonctions, geometrie |
| ap-trois-pieces#1 | mathematiques | complète | oui | 5 | 5.8 s | 18.7 s | 1 | 0 | — | 0 | probabilites |
| ap-trois-pieces#2 | mathematiques | complète | oui | 4 | 3.1 s | 10.5 s | 0 | 1 | — | 0 | probabilites |
| ap-zeros-partie-entiere#1 | mathematiques | erreur incomplete | **non** | 1 | 5.6 s | 20.9 s | 3 | 1 | — | 0 | fonctions |
| ap-zeros-partie-entiere#2 | mathematiques | erreur incomplete | **non** | 3 | 9.7 s | 21.3 s | 4 | 1 | — | 0 | fonctions |
