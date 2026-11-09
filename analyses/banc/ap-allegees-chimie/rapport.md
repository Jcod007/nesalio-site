# Banc Nesalio — ap-allegees-chimie

Modèle : `deepseek/deepseek-v4.1-flash` · tirages : 2 · questions : 10 · leçons : 20 · lancé le 2026-11-09T21:21:23.575Z

## Synthèse

| Mesure | Valeur |
| --- | --- |
| Leçons intactes | **14/20 (70.0 %)** |
| — dont chimie | 14/20 (70.0 %) |
| Issues | complète : 14 ; erreur upstream : 6 |
| 1re tranche (médiane / max) | 4.1 s / 6.5 s |
| Durée totale (médiane / max) | 9.8 s / 20.8 s |
| Refus (corrections demandées) | 4 |
| Réparations sans appel | 20 |
| Lignes JSON illisibles | 1 |
| Appels au modèle | 24 |
| Réponse attendue écrite au tableau | 0/0 (dite seulement : 0) |
| Jetons (approx., 3.5 caractères/jeton) | entrée 263685, sortie 28110 |
| Coût approximatif | non calculé (PRIX_ENTREE et PRIX_SORTIE, en $ par million de jetons) |

### Critère Q7 automatique (leçons intactes)

Mesure partielle (10 questions × 2 tirage(s)) : le critère demande ≥ 30 questions × 2 tirages.
Les autres critères (0 erreur grave, note grille ≥ ancien tuteur et aucune leçon < 50/100, note visuelle ≥ 6/10) se notent à la main sur les fichiers `.lisible.txt`, avec `app/docs/grille-explication-nesalio.md`.

## Causes des refus et des échecs

- leçon : erreur upstream : 6
- JSON illisible : 2
- autre : 1
- repère absent : 1
- clé inconnue : 1
- cible inconnue : 1

## Détail par leçon

| Leçon | Discipline | Issue | Intacte | Tranches | 1re tranche | Total | Refus | Réparations | Réponse écrite | Jamais montrés | Guides |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ap-acide-base-sel#1 | chimie | complète | oui | 5 | 4.1 s | 9.9 s | 0 | 2 | — | 0 | chimie_acides |
| ap-acide-base-sel#2 | chimie | erreur upstream | **non** | 0 | — | 0.4 s | 0 | 0 | — | 0 | chimie_acides |
| ap-co2-ionique#1 | chimie | complète | oui | 4 | 3.0 s | 9.8 s | 0 | 2 | — | 0 | aucun |
| ap-co2-ionique#2 | chimie | erreur upstream | **non** | 0 | — | 0.3 s | 0 | 0 | — | 0 | aucun |
| ap-conductibilite-ph#1 | chimie | complète | oui | 6 | 5.2 s | 15.3 s | 0 | 0 | — | 0 | chimie_acides |
| ap-conductibilite-ph#2 | chimie | erreur upstream | **non** | 0 | — | 0.3 s | 0 | 0 | — | 0 | chimie_acides |
| ap-endo-exo-exemples#1 | chimie | complète | oui | 4 | 6.5 s | 10.2 s | 0 | 2 | — | 0 | chimie_energie, chimie_balancement |
| ap-endo-exo-exemples#2 | chimie | complète | oui | 4 | 2.9 s | 9.8 s | 0 | 1 | — | 0 | chimie_energie, chimie_balancement |
| ap-kc-solide#1 | chimie | complète | oui | 4 | 4.8 s | 10.3 s | 0 | 4 | — | 1 | chimie_equilibre, chimie_concentration |
| ap-kc-solide#2 | chimie | complète | oui | 3 | 4.5 s | 8.2 s | 0 | 2 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-le-chatelier-concentration#1 | chimie | complète | oui | 5 | 4.5 s | 11.7 s | 0 | 2 | — | 0 | chimie_equilibre, chimie_concentration |
| ap-le-chatelier-concentration#2 | chimie | complète | oui | 4 | 3.5 s | 9.5 s | 0 | 3 | — | 1 | chimie_equilibre, chimie_concentration |
| ap-masse-moles#1 | chimie | complète | oui | 6 | 3.8 s | 20.8 s | 2 | 1 | — | 1 | chimie_stoechiometrie, chimie_mole |
| ap-masse-moles#2 | chimie | erreur upstream | **non** | 0 | — | 0.5 s | 0 | 0 | — | 0 | chimie_stoechiometrie, chimie_mole |
| ap-ph5-base#1 | chimie | complète | oui | 4 | 4.5 s | 8.8 s | 0 | 0 | — | 0 | chimie_acides |
| ap-ph5-base#2 | chimie | complète | oui | 4 | 3.2 s | 8.4 s | 0 | 0 | — | 0 | chimie_acides |
| ap-titrage-yamaska#1 | chimie | complète | oui | 4 | 3.1 s | 10.5 s | 0 | 0 | — | 0 | chimie_acides |
| ap-titrage-yamaska#2 | chimie | erreur upstream | **non** | 0 | — | 0.9 s | 0 | 0 | — | 0 | chimie_acides |
| ap-zinc-hcl#1 | chimie | complète | oui | 4 | 4.2 s | 13.4 s | 1 | 1 | — | 0 | chimie_acides |
| ap-zinc-hcl#2 | chimie | erreur upstream | **non** | 1 | 2.9 s | 12.1 s | 1 | 0 | — | 0 | chimie_acides |
