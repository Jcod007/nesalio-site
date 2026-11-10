# Essais sur 20 vraies leçons de chimie — 2026-11-10

Méthode : `app/tools/eval/captures-nesalio.mjs` joue chaque leçon dans Chrome sur `/dev/nesalio?voix=simulee`
(voix muette au rythme réel) et garde une capture du tableau toutes les 5 s avec le texte de la voix
(`analyses/captures/<leçon>/`, non versionné). 8 juges (agents) ont regardé les 440 captures une par une, en
comparant chaque image à ce que la voix dit. Code jugé : arbre de travail après dd888d4 (composition non commitée).
Rapports détaillés : notes de session `juge-captures-lot-A.md` à `-H.md`.

Leçons : 6 générées pour l'essai (g1 à g6, DeepSeek + relecteur Claude), 3 jouées le matin par l'utilisateur (j-),
11 du banc `ap3n-relecteur` de la veille (b-).

## Notes sur 10

| Leçon | Cadrage | Voix/tableau | Contenu | Globale |
| --- | --- | --- | --- | --- |
| j-stoechiometrie | 6 | 6 | 7 | 6,5 |
| j-loi_gaz_parfaits_pression | 6 | 6 | 8 | 6,5 |
| b-gaz-ambulance-o2 | 6 | 6 | 7 | 6,5 |
| g6-gaz-parfaits | 6 | 5,5 | 8 | 6,5 |
| g1-moles-eau | 6 | 5 | 7 | 6 |
| g4-reactif-limitant | 5,5 | 6 | 7 | 6 |
| b-masse-molaire-coefficients | 5 | 6 | 8 | 6 |
| g2-boyle | 4,5 | 5 | 7 | 5,5 |
| g3-combustion-methane | 5 | 4 | 5 | 5 |
| b-gaz-charles-seringue | 6 | 5 | 4 | 5 |
| b-gaz-deplacement-eau | 5 | 7 | 7 | 5 |
| g5-concentration | 4 | 5 | 6 | 4,5 |
| b-grammes-reactif-non-limitant | 5 | 6 | 3 | 4 |
| b-gaz-volume-molaire-caracteristique | 5 | 4 | 6 | 4 |
| b-gaz-boyle-pression-diminue | 4 | 4 | 4 | 4 |
| b-gaz-stoechio-pression-diminue | 4 | 4 | 5 | 4 |
| j-reaction_exothermique | 3 | 3 | 4 | 3 |
| b-gaz-zinc-dihydrogene | 4 | 5 | 6 | 3 |
| b-fes2-o2-moles | 5 | 3 | 3 | 3 |
| b-gaz-volume-molaire-323k | 5 | 3 | 6 | 3 |

Moyenne 4,9. Générées le jour même : 5,6 ; banc de la veille : 4,3. Aucune leçon à 7 ou plus.
Sans défaut bloquant d'après les juges : ambulance O₂, réactif limitant (g4), gaz parfaits (g6).

## Défauts classés (gravité, puis nombre de leçons)

### Bloquants
1. **Code LaTeX brut au tableau** — 4 leçons (zinc, FeS₂, volume molaire 323 K, + « entit\'es » vu en direct).
   Cause moteur : un `math` à contenu `computed` (gabarit + `{value}`) est dessiné comme du texte
   (`NesalioProjection.prepareSlice` ne prépare que les formules fixes). 38 cas dans les leçons gardées, aucun ne
   dépend d'un paramètre animé.
2. **Nombres à virgule cassés dans `\pu{…}`** (« 58 ,⁴⁴ g / mol ») — 2 leçons (concentration, déplacement d'eau).
   Cause rendu : conversion de `\pu` avec `{,}`.
3. **Formule avec lettre accentuée non rendue** (« MathJax retry ») — 3 leçons au moins. Cause : MathJax 4.1.3
   embarqué par manim-web 0.39.4 avec `asyncLoad: null` : la police des lettres accentuées, chargée à la demande,
   ne peut pas l'être. La formule retombe en texte manuscrit, ou reste non surlignée.
4. **Le tableau contredit la voix ou est faux** — 7 leçons : diagramme d'énergie plat, point à 250 kPa au lieu de
   50, tableau de comptage jamais mis à jour, 1,10 affiché contre 0,80 dit, tableau de données inversé (lignes et
   colonnes), tableaux sans en-têtes aux valeurs arbitraires, leçon qui s'arrête sans la réponse. Cause : JSON du
   modèle, non rattrapé par le relecteur ni par les contrôles.
5. **Dit mais jamais montré** — 8 leçons : ΔH, synthèse finale (tableau vide à la fin), « + » et flèche d'une
   équation, 3 points sur 5 d'un schéma, comparaison finale, données de l'exemple. Cause : JSON (objet déclaré sans
   `show`, ou jamais déclaré).
6. **Textes l'un sur l'autre** — 3 leçons : `center_on` un objet encore visible, étiquette `inside` un tableau,
   ligne posée contre une fraction sans marge. Cause : JSON + placement qui ne l'empêche pas.
7. **Amas illisible pendant un `transform`** — 1 leçon (déplacement d'eau, t071).

### Gênants
8. **Résultat affiché avant que la voix le dise** — 12 leçons au moins, 7 à 17 s d'avance. Causes : formule sans
   `parts` écrite d'un coup ; repli « formule écrite d'un coup » de la réparation ; tableau montré entier.
9. **Cadrage** — 20 leçons : sujet décentré, moitié d'écran vide, contenu à ras du bord, zoom excessif (lettres de
   90 px), image finale minuscule ou dominée par l'étape d'avant grisée, `camera.focus` du JSON sans effet visible
   (2 leçons, à rapprocher de `smallReframing`), cible de caméra inexistante non signalée.
10. **Tableau figé 15 s ou plus** — 18 leçons (jusqu'à 49 s). Cause : JSON, trop peu d'objets pour la durée de voix.
11. **Tailles sans hiérarchie** — toutes : formules environ 3 fois plus grosses que le texte manuscrit.
12. **Polices mélangées** — cases de tableau qui changent de police après surlignage (2 leçons).
13. **Coupure de ligne avant « : »** — 1 leçon ; vient de `boardLines` (non commité).

### Autres
- Aucun avertissement ni erreur émis par l'application pour ces défauts, sauf un cadrage hors champ.
- Lecture figée sans message quand le réseau saute pendant une génération en direct (vu sur 3 leçons).
- Lapsus écrit par le modèle dans la voix (« quarante-six… pardon, trente-six ») vu une fois en direct.
- Outil de capture : trous de 15 à 30 s sur 3 leçons capturées pendant la coupure réseau, à 3 lectures en parallèle.

## Répartition des causes
Contenu du JSON écrit par le modèle : un peu plus de la moitié des défauts et la plupart des bloquants de fond.
Rendu des formules : peu de défauts, mais tous bloquants et tous corrigeables dans notre code.
Caméra et placement : le défaut le plus fréquent, rarement bloquant.
