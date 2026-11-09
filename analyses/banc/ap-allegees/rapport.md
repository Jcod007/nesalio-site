# Banc Nesalio — ap-allegees

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 35 · leçons : 70 · lancé le 2026-11-09T21:17:15.930Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **56/70 (80.0 %)** |
| — dont chimie | 16/26 (61.5 %) |
| — dont mathematiques | 40/44 (90.9 %) |
| Issues | complète : 57 ; erreur upstream : 9 ; erreur incomplete : 4 |
| 1re tranche (médiane / max) | 4.9 s / 23.6 s |
| Durée totale (médiane / max) | 14.5 s / 44.1 s |
| Refus (corrections demandées) | 43 |
| Réparations sans appel | 62 |
| Lignes JSON illisibles | 3 |
| Appels au modèle | 111 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 1282929, sortie 152090 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

**Non atteint** : 80.0 % pour un seuil de 95 % (35 questions × 2 tirages).
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 20
- leçon : erreur upstream : 9
- JSON illisible : 6
- cible inconnue : 6
- type ou champ manquant : 5
- clé inconnue : 4
- leçon : erreur incomplete : 4
- repère absent : 3
- tranche perdue sans refus : 2
- identifiant invalide : 2
- objet visé après remove : 1
- nom inconnu dans une expression : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-bicarbonate-vinaigre#1 | chimie | complète | oui | 3 | 4.0 s | 8.7 s | 0 | 1 | — | 0 | chimie_acides, chimie_balancement |
| ap-bicarbonate-vinaigre#2 | chimie | erreur upstream | **non** | 0 | — | 3.2 s | 0 | 0 | — | 0 | chimie_acides, chimie_balancement |
| ap-complexe-active#1 | chimie | complète | oui | 4 | 5.0 s | 10.8 s | 0 | 3 | — | 0 | chimie_energie |
| ap-complexe-active#2 | chimie | complète | oui | 5 | 2.4 s | 9.6 s | 0 | 2 | — | 1 | chimie_energie |
| ap-endo-exo#1 | chimie | complète | oui | 4 | 2.2 s | 8.1 s | 0 | 1 | — | 1 | aucun |
| ap-endo-exo#2 | chimie | complète | oui | 4 | 11.4 s | 12.3 s | 0 | 0 | — | 0 | aucun |
| ap-equilibrer#1 | chimie | complète | oui | 5 | 3.8 s | 12.6 s | 0 | 2 | — | 1 | chimie_balancement |
| ap-equilibrer#2 | chimie | erreur upstream | **non** | 0 | — | 0.9 s | 0 | 0 | — | 0 | chimie_balancement |
| ap-isoler-temperature#1 | chimie | complète | oui | 4 | 4.7 s | 9.9 s | 0 | 0 | — | 0 | algebre |
| ap-isoler-temperature#2 | chimie | erreur upstream | **non** | 0 | — | 2.3 s | 0 | 0 | — | 0 | algebre |
| ap-kc-donnee-manquante#1 | chimie | complète | oui | 5 | 3.9 s | 10.3 s | 0 | 2 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kc-donnee-manquante#2 | chimie | complète | oui | 4 | 4.8 s | 12.0 s | 0 | 3 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kps-solubilite#1 | chimie | complète | oui | 5 | 3.2 s | 13.3 s | 0 | 1 | — | 0 | chimie_equilibre, chimie_acides |
| ap-kps-solubilite#2 | chimie | erreur upstream | **non** | 3 | 3.0 s | 21.4 s | 1 | 2 | — | 0 | chimie_equilibre, chimie_acides |
| ap-loi-hess#1 | chimie | complète | oui | 6 | 7.9 s | 38.9 s | 1 | 0 | — | 0 | chimie_energie |
| ap-loi-hess#2 | chimie | erreur upstream | **non** | 0 | — | 2.0 s | 0 | 0 | — | 0 | chimie_energie |
| ap-ph-log#1 | chimie | complète (perdue : (sans identifiant)) | **non** | 5 | 23.6 s | 30.6 s | 1 | 0 | — | 1 | chimie_acides, chimie_concentration |
| ap-ph-log#2 | chimie | erreur upstream | **non** | 0 | — | 0.4 s | 0 | 0 | — | 0 | chimie_acides, chimie_concentration |
| ap-ppm-mol#1 | chimie | complète | oui | 4 | 10.6 s | 19.0 s | 1 | 0 | — | 0 | chimie_concentration |
| ap-ppm-mol#2 | chimie | erreur upstream | **non** | 0 | — | 2.3 s | 0 | 0 | — | 0 | chimie_concentration |
| ap-reactif-limitant#1 | chimie | complète | oui | 4 | 3.9 s | 8.1 s | 0 | 1 | — | 0 | chimie_mole |
| ap-reactif-limitant#2 | chimie | erreur upstream | **non** | 0 | — | 0.4 s | 0 | 0 | — | 0 | chimie_mole |
| ap-solubilite-g-mol#1 | chimie | complète | oui | 4 | 4.2 s | 9.6 s | 0 | 2 | — | 0 | chimie_concentration |
| ap-solubilite-g-mol#2 | chimie | complète | oui | 5 | 2.7 s | 10.0 s | 0 | 2 | — | 0 | chimie_concentration |
| ap-vitesse-ordre-2#1 | chimie | complète | oui | 4 | 4.2 s | 25.8 s | 1 | 0 | — | 1 | chimie_vitesse, chimie_concentration |
| ap-vitesse-ordre-2#2 | chimie | erreur upstream | **non** | 0 | — | 3.8 s | 0 | 0 | — | 0 | chimie_vitesse, chimie_concentration |
| ap-correlation-force#1 | mathematiques | complète | oui | 4 | 11.6 s | 24.0 s | 0 | 1 | — | 1 | statistiques |
| ap-correlation-force#2 | mathematiques | complète | oui | 5 | 15.2 s | 16.4 s | 0 | 0 | — | 0 | statistiques |
| ap-correlation-tableau#1 | mathematiques | complète | oui | 5 | 4.5 s | 12.5 s | 0 | 2 | — | 0 | statistiques |
| ap-correlation-tableau#2 | mathematiques | complète | oui | 4 | 9.6 s | 17.4 s | 0 | 0 | — | 0 | statistiques |
| ap-ellipse-b#1 | mathematiques | complète | oui | 4 | 2.8 s | 8.2 s | 0 | 0 | — | 0 | aucun |
| ap-ellipse-b#2 | mathematiques | complète | oui | 5 | 2.9 s | 12.9 s | 1 | 1 | — | 0 | aucun |
| ap-exponentielle-bases#1 | mathematiques | erreur incomplete | **non** | 3 | 4.5 s | 40.4 s | 4 | 0 | — | 0 | aucun |
| ap-exponentielle-bases#2 | mathematiques | complète | oui | 5 | 3.0 s | 12.0 s | 1 | 0 | — | 0 | aucun |
| ap-factoriser-cubique#1 | mathematiques | erreur incomplete | **non** | 2 | 5.7 s | 29.2 s | 3 | 1 | — | 0 | polynomes |
| ap-factoriser-cubique#2 | mathematiques | complète | oui | 6 | 9.5 s | 44.1 s | 3 | 0 | — | 2 | polynomes |
| ap-forme-generale#1 | mathematiques | complète | oui | 4 | 6.3 s | 15.2 s | 0 | 2 | — | 0 | fonctions, algebre |
| ap-forme-generale#2 | mathematiques | complète | oui | 4 | 3.5 s | 10.2 s | 1 | 0 | — | 0 | fonctions, algebre |
| ap-graphes-chemin#1 | mathematiques | complète | oui | 4 | 8.0 s | 15.1 s | 1 | 0 | — | 0 | aucun |
| ap-graphes-chemin#2 | mathematiques | complète | oui | 6 | 4.9 s | 18.2 s | 2 | 0 | — | 0 | aucun |
| ap-inequation-valeur-absolue#1 | mathematiques | complète | oui | 4 | 5.3 s | 17.4 s | 0 | 2 | — | 0 | valeur_absolue, fonctions |
| ap-inequation-valeur-absolue#2 | mathematiques | complète | oui | 5 | 4.7 s | 18.0 s | 0 | 2 | — | 1 | valeur_absolue, fonctions |
| ap-mediane#1 | mathematiques | complète | oui | 5 | 15.8 s | 34.8 s | 3 | 1 | — | 0 | statistiques |
| ap-mediane#2 | mathematiques | complète | oui | 5 | 16.5 s | 26.1 s | 0 | 2 | — | 0 | statistiques |
| ap-parabole-foyer#1 | mathematiques | complète | oui | 5 | 5.1 s | 14.6 s | 1 | 0 | — | 0 | fonctions |
| ap-parabole-foyer#2 | mathematiques | complète | oui | 4 | 4.1 s | 10.0 s | 0 | 0 | — | 1 | fonctions |
| ap-pente-un-point#1 | mathematiques | complète | oui | 4 | 7.0 s | 10.1 s | 0 | 1 | — | 0 | analytique, polynomes |
| ap-pente-un-point#2 | mathematiques | complète | oui | 5 | 4.7 s | 16.4 s | 1 | 1 | — | 0 | analytique, polynomes |
| ap-periodique-periode#1 | mathematiques | complète | oui | 6 | 8.5 s | 22.3 s | 1 | 1 | — | 0 | fonctions |
| ap-periodique-periode#2 | mathematiques | complète | oui | 4 | 23.1 s | 26.8 s | 0 | 0 | — | 0 | fonctions |
| ap-perpendiculaire-point#1 | mathematiques | complète | oui | 5 | 5.1 s | 15.4 s | 0 | 1 | — | 0 | analytique, algebre |
| ap-perpendiculaire-point#2 | mathematiques | complète | oui | 6 | 6.3 s | 15.0 s | 0 | 1 | — | 1 | analytique, algebre |
| ap-polygone-contraintes#1 | mathematiques | complète | oui | 5 | 2.0 s | 19.0 s | 1 | 1 | — | 0 | algebre |
| ap-polygone-contraintes#2 | mathematiques | complète | oui | 4 | 3.0 s | 8.2 s | 0 | 0 | — | 0 | algebre |
| ap-proba-conditionnelle-venn#1 | mathematiques | complète | oui | 6 | 14.2 s | 39.1 s | 2 | 1 | — | 0 | probabilites |
| ap-proba-conditionnelle-venn#2 | mathematiques | complète | oui | 5 | 5.5 s | 17.5 s | 1 | 0 | — | 1 | probabilites |
| ap-quadratique-table#1 | mathematiques | complète | oui | 5 | 9.2 s | 27.6 s | 1 | 3 | — | 1 | fonctions, polynomes |
| ap-quadratique-table#2 | mathematiques | erreur incomplete (perdue : s_canonique) | **non** | 3 | 2.8 s | 33.5 s | 4 | 0 | — | 0 | fonctions, polynomes |
| ap-regle-majorite#1 | mathematiques | complète | oui | 4 | 5.0 s | 12.6 s | 0 | 0 | — | 0 | aucun |
| ap-regle-majorite#2 | mathematiques | complète | oui | 4 | 4.0 s | 13.2 s | 0 | 1 | — | 1 | aucun |
| ap-sinus-cosinus#1 | mathematiques | complète | oui | 4 | 4.4 s | 9.5 s | 0 | 0 | — | 0 | fonctions, geometrie |
| ap-sinus-cosinus#2 | mathematiques | erreur incomplete | **non** | 1 | 3.3 s | 12.7 s | 3 | 0 | — | 4 | fonctions, geometrie |
| ap-systeme-produit#1 | mathematiques | complète | oui | 6 | 7.3 s | 27.3 s | 0 | 5 | — | 0 | aucun |
| ap-systeme-produit#2 | mathematiques | complète | oui | 6 | 6.7 s | 16.4 s | 0 | 2 | — | 1 | aucun |
| ap-trigo-rectangle#1 | mathematiques | complète | oui | 4 | 5.3 s | 13.5 s | 0 | 1 | — | 0 | fonctions, geometrie |
| ap-trigo-rectangle#2 | mathematiques | complète | oui | 4 | 11.1 s | 18.5 s | 0 | 1 | — | 3 | fonctions, geometrie |
| ap-trois-pieces#1 | mathematiques | complète | oui | 4 | 8.6 s | 16.3 s | 1 | 3 | — | 10 | probabilites |
| ap-trois-pieces#2 | mathematiques | complète | oui | 5 | 2.3 s | 15.8 s | 1 | 0 | — | 0 | probabilites |
| ap-zeros-partie-entiere#1 | mathematiques | complète | oui | 5 | 5.3 s | 17.1 s | 1 | 1 | — | 0 | fonctions |
| ap-zeros-partie-entiere#2 | mathematiques | complète | oui | 5 | 4.1 s | 14.3 s | 1 | 2 | — | 3 | fonctions |
