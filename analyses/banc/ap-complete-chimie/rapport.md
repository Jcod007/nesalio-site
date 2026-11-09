# Banc Nesalio — ap-complete-chimie

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 10 · leçons : 20 · lancé le 2026-11-09T21:21:10.126Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **16/20 (80.0 %)** |
| — dont chimie | 16/20 (80.0 %) |
| Issues | erreur incomplete : 1 ; complète : 16 ; erreur upstream : 3 |
| 1re tranche (médiane / max) | 4.0 s / 6.7 s |
| Durée totale (médiane / max) | 11.7 s / 24.9 s |
| Refus (corrections demandées) | 11 |
| Réparations sans appel | 13 |
| Lignes JSON illisibles | 0 |
| Appels au modèle | 30 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 350567, sortie 38920 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (10 questions × 2 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- autre : 7
- leçon : erreur upstream : 3
- repère absent : 2
- type ou champ manquant : 2
- leçon : erreur incomplete : 1
- cible inconnue : 1
- objet visé après remove : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-acide-base-sel#1 | chimie | erreur incomplete | **non** | 1 | 4.2 s | 15.7 s | 3 | 0 | — | 0 | chimie_acides |
| ap-acide-base-sel#2 | chimie | complète | oui | 5 | 2.5 s | 14.7 s | 0 | 0 | — | 0 | chimie_acides |
| ap-co2-ionique#1 | chimie | complète | oui | 6 | 4.0 s | 12.6 s | 0 | 0 | — | 0 | aucun |
| ap-co2-ionique#2 | chimie | erreur upstream | **non** | 0 | — | 6.2 s | 0 | 0 | — | 0 | aucun |
| ap-conductibilite-ph#1 | chimie | complète | oui | 5 | 4.0 s | 13.1 s | 0 | 1 | — | 0 | chimie_acides |
| ap-conductibilite-ph#2 | chimie | erreur upstream | **non** | 1 | 4.0 s | 7.8 s | 1 | 0 | — | 0 | chimie_acides |
| ap-endo-exo-exemples#1 | chimie | complète | oui | 4 | 2.6 s | 6.2 s | 0 | 0 | — | 0 | chimie_energie, chimie_balancement |
| ap-endo-exo-exemples#2 | chimie | complète | oui | 6 | 3.3 s | 21.8 s | 2 | 1 | — | 0 | chimie_energie, chimie_balancement |
| ap-kc-solide#1 | chimie | complète | oui | 3 | 4.7 s | 7.6 s | 0 | 1 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-kc-solide#2 | chimie | complète | oui | 3 | 6.1 s | 10.9 s | 0 | 2 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-le-chatelier-concentration#1 | chimie | complète | oui | 5 | 3.5 s | 9.4 s | 0 | 3 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-le-chatelier-concentration#2 | chimie | complète | oui | 5 | 3.6 s | 11.6 s | 0 | 1 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-masse-moles#1 | chimie | complète | oui | 6 | 4.6 s | 24.9 s | 2 | 1 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap-masse-moles#2 | chimie | complète | oui | 6 | 2.2 s | 14.5 s | 0 | 0 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap-ph5-base#1 | chimie | complète | oui | 4 | 4.7 s | 10.7 s | 0 | 0 | — | 0 | chimie_acides |
| ap-ph5-base#2 | chimie | complète | oui | 3 | 5.8 s | 15.2 s | 1 | 0 | — | 1 | chimie_acides |
| ap-titrage-yamaska#1 | chimie | complète | oui | 5 | 5.2 s | 11.7 s | 0 | 0 | — | 1 | chimie_acides |
| ap-titrage-yamaska#2 | chimie | erreur upstream | **non** | 0 | — | 4.4 s | 0 | 0 | — | 0 | chimie_acides |
| ap-zinc-hcl#1 | chimie | complète | oui | 4 | 6.7 s | 16.0 s | 2 | 3 | — | 1 | chimie_acides |
| ap-zinc-hcl#2 | chimie | complète | oui | 4 | 3.3 s | 8.2 s | 0 | 0 | — | 0 | chimie_acides |
