# Grille d'évaluation d'une explication Nesalio (/100)

Objet évalué : une explication de Nesa, c'est-à-dire un monologue oral synchronisé avec un tableau (formules,
graphiques, figures, tableaux de valeurs). Cette grille sert à noter les leçons produites par le banc
(`tools/eval/banc-nesalio.test.mjs`) sur le corpus versionné (`tools/eval/corpus-nesalio.json`). Elle remplace
l'ancienne notation R, I, E, M, P, O, T, L (1 à 5 sans pondération). Elle ne remplace pas
`grille-evaluation-pedagogique.md`, qui porte sur le tuteur interactif.

Rédigée le 2026-11-08 (grille de l'analyste, `grille-et-questions.md`) ; versée dans le dépôt avec les critères
de confiance décidés par l'utilisateur (Q7).

## Critères « on peut s'y fier » (décision Q7)

Nesalio est jugé fiable sur son périmètre — **mathématiques et chimie de secondaire 4 et 5 (Québec)** — quand
toutes les conditions suivantes sont réunies, sur la même version du code et du modèle :

| # | Critère | Comment on le mesure |
|---|---|---|
| 1 | **≥ 95 % de leçons intactes** sur **≥ 30 questions** (maths + chimie sec 4-5) × **2 tirages** | automatique : `rapport.md` du banc (leçon intacte = finie par `end`, aucune tranche perdue, leçon entière valide) |
| 2 | **0 erreur grave** (G, section 1.2) | notation à la main des fichiers `.lisible.txt` |
| 3 | **Note grille ≥ celle de l'ancien tuteur** sur les mêmes questions, et **aucune leçon < 50/100** | notation à la main (section 1.4), à l'aveugle, deux correcteurs |
| 4 | **Note visuelle ≥ 6/10** | juge visuel, sur les vidéos (`tools/eval/video-nesalio.mjs`) |
| 5 | **Tous les bloquants fermés, chacun avec un test** | backlog de l'analyste, suite `npx vitest run` |

Les questions de physique du corpus (`horsPerimetre`) sont notées à part et ne comptent pas.

## Lancer la mesure

Dans `app/` :

```sh
BANC=1 npx vitest run tools/eval/banc-nesalio.test.mjs                      # tout le périmètre, 2 tirages
BANC=1 TUTOR_MODEL=anthropic/claude-sonnet-4.5 SORTIE=sonnet npx vitest run tools/eval/banc-nesalio.test.mjs
BANC=1 TIRAGES=1 QUESTIONS=equation,chimie-mole SORTIE=essai npx vitest run tools/eval/banc-nesalio.test.mjs
```

Le banc écrit `analyses/banc/<SORTIE>/rapport.md` (critère 1, délais, refus, réparations, coût approximatif avec
`PRIX_ENTREE` et `PRIX_SORTIE` en $ par million de jetons) et, par leçon, un `.lisible.txt` qui commence par la
question, la réponse de référence, les attendus à cocher et les erreurs graves à chercher, sans nom de modèle.

---

## Grille

### 1.1 Ce qu'on évalue

On évalue uniquement ce que l'élève **entend** (les phrases dites) et ce qu'il **voit** (les objets affichés, et à quel moment). On ignore :
- le format du fichier (JSON, noms d'objets, identifiants, verbes du moteur) ;
- les métadonnées (titre de leçon, objectifs pédagogiques, notes internes) ;
- tout texte qui n'est ni dit ni affiché.

Exception propre à la page élève : le **titre de leçon** est affiché dans la barre du haut ; il compte donc comme affiché (un titre qui donne une réponse fausse est une erreur grave, comme dans la mesure de départ du 2026-11-08).

Un objet est **affiché** s'il apparaît au tableau pendant la leçon. Un objet créé puis jamais montré n'existe pas pour l'élève. Un texte affiché mal rendu (LaTeX cassé, symboles parasites) compte tel que l'élève le verrait.

### 1.2 Classement des erreurs (avant toute note)

Le correcteur dresse d'abord la liste de toutes les erreurs, dites ou affichées. Il classe chacune dans une des deux catégories suivantes.

**Erreur grave (G).** Énoncé mathématique, chimique ou physique faux, qu'un élève pourrait apprendre tel quel. Exemples :
- calcul faux (« le nombre dérivé de x² en 2 vaut 2 ») ;
- règle fausse (« on ajoute la moitié du coefficient ») ;
- équation chimique mal équilibrée, masse molaire ou unité fausse (« 40 g/mL » pour 40 g/L) ;
- loi physique contredite (« la hauteur ne change pas le temps de chute ») ;
- figure ou graphique qui contredit les nombres annoncés (point « sur la courbe » qui n'y est pas, tangente de mauvaise pente, aire mal découpée) ;
- formule appliquée hors de son domaine de validité dans l'exemple même ;
- réponse finale fausse ;
- causalité affirmée à partir d'une corrélation.

**Imprécision (I).** Énoncé maladroit, incomplet ou approximatif qui n'enseigne pas une chose fausse si on le lit avec bienveillance. Exemples :
- abus de langage (« une droite, c'est la pente moyenne ») ;
- « P tombe sur A » au lieu de « P tend vers A » ;
- condition d'application omise alors que l'exemple la respecte (portée sans dire « même hauteur de départ et d'arrivée ») ;
- arrondi non signalé ;
- unité manquante une fois ;
- vocabulaire impropre (« cloche » pour une parabole) ;
- erreur dite puis aussitôt corrigée à voix haute.

En cas de doute entre G et I, on se demande : « un élève qui retient cette phrase ou cette image perdra-t-il des points à un examen du MEQ ? » Si oui, c'est G.

Une erreur répétée (dite puis affichée, ou dite deux fois) compte **une seule fois**. Deux erreurs différentes comptent deux fois.

### 1.3 Critères, poids et descripteurs

Chaque critère est noté de 1 à 5. Les notes 2 et 4 servent quand l'observation se situe entre deux descripteurs. En cas d'hésitation entre deux notes, on prend la plus basse et on note la raison du doute.

| # | Critère | Poids |
|---|---|---|
| C1 | Exactitude | 20 |
| C2 | Pertinence | 15 |
| C3 | Construction du sens | 15 |
| C4 | Exemple travaillé jusqu'au résultat | 10 |
| C5 | Progression et justification des étapes | 10 |
| C6 | Cohérence parole-tableau | 10 |
| C7 | Qualité du tableau | 8 |
| C8 | Langue orale et vocabulaire du programme québécois | 7 |
| C9 | Concision | 5 |
| | **Total** | **100** |

#### C1. Exactitude (poids 20). La note se calcule à partir du décompte de 1.2.

| Note | Règle |
|---|---|
| 5 | Aucune erreur grave, aucune imprécision. Tous les calculs refaits par le correcteur concordent. |
| 4 | Aucune erreur grave, une imprécision. |
| 3 | Aucune erreur grave, deux ou trois imprécisions. |
| 2 | Aucune erreur grave, quatre imprécisions ou plus. |
| 1 | Au moins une erreur grave. Le plafond de 1.4 s'applique en plus. |

#### C2. Pertinence (poids 15). Répond-elle à la question réellement posée ?

| Note | Ce qu'on observe |
|---|---|
| 5 | Répond exactement à la question, dans son registre : sens pour un « c'est quoi » ou un « pourquoi », méthode pour un « comment ». Si l'élève donne une réponse ou une démarche fausse (« j'obtiens… »), l'explication **nomme l'erreur précise**, explique pourquoi elle est fausse et montre la bonne démarche. Les données de l'élève sont reprises telles quelles. Tous les attendus de la question sont présents. |
| 3 | Traite la bonne notion, mais avec un des défauts suivants : glisse vers une question voisine, change les données de l'élève sans le dire, donne la bonne démarche sans diagnostiquer l'erreur de l'élève, ou laisse un attendu de fond absent. |
| 1 | Hors sujet. Ou bien elle ignore l'erreur de l'élève et les données fournies, ou elle répond à une autre question. |

Règles liées :
- si la réponse calculable attendue n'est jamais donnée, C2 ≤ 3 ;
- si l'explication pose une question à l'élève à laquelle elle ne répond pas, alors que le format est un monologue, retirer 1 point en C2 (sans descendre sous 1).

#### C3. Construction du sens (poids 15). Intuition, pourquoi avant comment, conditions d'application.

| Note | Ce qu'on observe |
|---|---|
| 5 | Part d'une intuition concrète ou d'une représentation : aire, pente, situation réelle, motif dans un tableau. La règle ou la formule est **justifiée** : on montre d'où elle vient, ou on dit honnêtement qu'on l'admet. Ses **conditions d'application** sont dites avant usage (dénominateur non nul, même hauteur, mode degrés, lien linéaire…). L'idée centrale est dite clairement en une phrase, au moins une fois. |
| 3 | Une intuition ou une justification est présente, mais partielle : la formule arrive avant le sens, une condition importante manque, ou l'idée centrale n'est jamais dite. |
| 1 | Recette pure : « on applique la formule », sans aucun pourquoi ni aucune condition. |

#### C4. Exemple travaillé jusqu'au résultat (poids 10)

| Note | Ce qu'on observe |
|---|---|
| 5 | Un exemple, de préférence celui de l'élève, est mené jusqu'au **résultat final**. Ce résultat est dit et **écrit** au tableau, avec ses unités s'il y a lieu, puis interprété (« donc 2433,31 $ après 5 ans »). Il y a une vérification (remplacer, redévelopper, ordre de grandeur) quand c'est pertinent. Pour une question de sens, un cas concret est déroulé jusqu'à une conclusion chiffrée ou observable. |
| 3 | L'exemple est mené au résultat, mais ce résultat n'est pas écrit, pas interprété ou pas vérifié. Ou bien l'exemple change de nombres en cours de route. |
| 1 | Pas d'exemple, ou un exemple abandonné avant le résultat. |

Règle liée : si la question demande un résultat calculable et que l'explication ne l'atteint pas, C4 ≤ 2.

#### C5. Progression et justification des étapes (poids 10)

| Note | Ce qu'on observe |
|---|---|
| 5 | Les étapes s'enchaînent dans un ordre logique, une idée à la fois. **Chaque transformation est justifiée** (« on enlève 3 des deux côtés pour garder l'égalité »). Aucune étape n'est sautée au tableau. Le passage du cas particulier à la règle générale est explicite. |
| 3 | Ordre globalement logique, mais une ou deux étapes sautées ou non justifiées (« on passe de l'autre côté »), ou un saut que l'élève de secondaire 4-5 ne peut pas combler seul. |
| 1 | Étapes désordonnées, contradictoires ou majoritairement non justifiées. |

#### C6. Cohérence parole-tableau (poids 10)

On compare la chronologie de ce qui est dit avec celle de ce qui est affiché.

| Note | Ce qu'on observe |
|---|---|
| 5 | Chaque chose annoncée (« je trace », « regarde ce point ») apparaît **au moment où elle est dite**. Les nombres dits et affichés sont les mêmes. Quand on passe d'une représentation à l'autre (calcul ↔ graphique), l'élément correspondant est pointé ou mis en évidence. Rien n'est montré avant d'être nécessaire. |
| 3 | Un ou deux décalages : un objet annoncé qui n'apparaît pas, un objet en avance ou en retard, une étiquette dite mais non affichée, ou un mouvement décrit mais immobile. |
| 1 | Le tableau et la parole racontent des choses différentes, ou de nombreux objets annoncés ne sont jamais montrés. |

#### C7. Qualité du tableau (poids 8)

| Note | Ce qu'on observe |
|---|---|
| 5 | Tout est lisible et bien rendu : pas de chevauchement, échelles adaptées, étiquettes présentes (longueurs, axes, noms de courbes). Chaque objet **porte une quantité ou une étape utile**. La trace finale résume la leçon : un élève qui ne verrait que le tableau final retrouverait l'essentiel. |
| 3 | Utile, mais avec un défaut : un objet décoratif ou inutile, une étiquette manquante, une expression mal rendue, une superposition ou une échelle trompeuse. |
| 1 | Illisible, cassé, décoratif ou quasi vide. Ou la figure contredit les nombres ; dans ce dernier cas, c'est aussi une erreur grave en C1. |

#### C8. Langue orale et vocabulaire du programme québécois (poids 7)

| Note | Ce qu'on observe |
|---|---|
| 5 | Phrases courtes, faites pour être entendues. Notations lues naturellement (« x au carré », « sinus de quarante degrés »), sans jargon de code (« t_vol », « v zéro sin thêta » en rafale). Tutoiement chaleureux, sans flatterie creuse. Vocabulaire du MEQ : taux de variation, valeur initiale, règle, zéros, forme canonique, mise en évidence, méthode produit-somme, loi des sinus, coefficient de corrélation, force résultante, dollars. |
| 3 | Compréhensible, mais avec quelques tournures écrites ou lourdes, une répétition à l'identique, des termes hors programme (« coefficient directeur », « méthode AC », « euros ») ou un jargon non défini. |
| 1 | Pénible à écouter : phrases tronquées, lecture de symboles bruts, registre inadapté ou vocabulaire majoritairement étranger au programme. |

#### C9. Concision (poids 5)

| Note | Ce qu'on observe |
|---|---|
| 5 | Chaque passage fait avancer l'explication. Pas de redite ni de second exemple inutile. Longueur proportionnée à la question : environ 1 à 3 minutes d'oral pour une question ciblée. |
| 3 | Une ou deux redites ou digressions (récapitulatif qui répète tout, exemple supplémentaire inachevé), ou une explication un peu trop courte pour être complète. |
| 1 | Très délayée (le propos se perd) ou tronquée au point de ne rien expliquer. |

### 1.4 Calcul de la note finale (sur 100)

1. **Note brute** : S = Σ poidsᵢ × (noteᵢ − 1) / 4. Une note de 1 donne 0 point, une note de 5 donne le poids entier.
2. **Plafond d'exactitude**, déterminé par le décompte de 1.2 :

| Situation | Plafond P |
|---|---|
| Aucune erreur grave | 100 |
| Une seule erreur grave, qui ne touche ni la réponse demandée ni l'idée centrale | 50 |
| Erreur grave sur la réponse demandée, sur l'idée centrale ou sur la règle enseignée, **ou** deux erreurs graves ou plus | 30 |

3. **Plafond de pertinence** : si C2 = 1 (hors sujet), P = min(P, 40).
4. **Note finale** = min(S, P), arrondie à l'entier.

Exemples :
- C1 à C9 tous à 4 : S = 75, aucun plafond, note finale 75.
- Même explication, mais « le nombre dérivé en 2 vaut 2 » alors que c'est la question : C1 = 1, donc S = 70 ; plafond 30 ; note finale 30.

Lecture indicative : 85 et plus, excellente ; 70 à 84, bonne ; 50 à 69, utilisable avec réserves ; moins de 50, à ne pas montrer à un élève.

### 1.5 Consignes au correcteur, pour rester constant

1. **Avant de lire l'explication**, résoudre soi-même la question et écrire la réponse de référence. Comparer ensuite cette référence aux attendus de la question (partie 2).
2. **Lire l'explication en entier** une première fois sans noter. Reconstituer la chronologie : pour chaque passage, ce qui est dit et ce qui est affiché à ce moment.
3. **Refaire chaque calcul** dit ou affiché : arithmétique, coordonnées de points sur une courbe, pentes de droites tracées, aires des pièces d'une figure, unités, arrondis. Rien n'est « évidemment juste ». Lister les calculs vérifiés.
4. **Dresser la liste des erreurs** (G ou I, selon 1.2) **avant** de noter les critères. Puis noter C1 à C9 dans l'ordre.
5. **Citer une preuve pour chaque note** différente de 5 : une phrase dite entre guillemets, ou la description de l'objet affiché et de son moment. Une note sans citation est invalide.
6. **Cocher chaque attendu** de la question : présent, partiel ou absent, avec sa citation. Les attendus nourrissent C2, C3 et C4, mais ne remplacent pas la grille.
7. **Ignorer** le format d'écriture du fichier, les noms internes, la longueur du JSON et la qualité du code. Ne pas récompenser la longueur. Ne pas pénaliser deux fois le même défaut dans deux critères, sauf la figure fausse (C1 et C7), qui est prévue.
8. **Noter à l'aveugle** : ne pas savoir quelle version on note, mélanger l'ordre des versions d'une question à l'autre, et noter toutes les versions d'une même question à la suite.
9. **Double correction** : deux correcteurs indépendants. Tout écart de plus d'un point sur un critère, ou tout désaccord G/I, se règle par discussion avec preuves. On rapporte les écarts initiaux.
10. **Correcteur IA** : même consignes, une explication par appel, température basse. Rendre le résultat sous la forme ci-dessous.

```json
{
  "question_id": "…",
  "reference": "réponse calculée par le correcteur",
  "calculs_verifies": ["…"],
  "erreurs": [{"type": "G|I", "citation": "…", "correction": "…", "touche_reponse_ou_idee_centrale": true}],
  "attendus": [{"attendu": "…", "statut": "present|partiel|absent", "citation": "…"}],
  "notes": {"C1": 0, "C2": 0, "C3": 0, "C4": 0, "C5": 0, "C6": 0, "C7": 0, "C8": 0, "C9": 0},
  "preuves": {"C2": "…"},
  "note_brute": 0,
  "plafond": 100,
  "note_finale": 0
}
```

---

## Questions et attendus

Les questions, leurs attendus vérifiables, leur réponse de référence et les erreurs graves prévues sont dans
`tools/eval/corpus-nesalio.json` (au moins 30 questions de maths et de chimie de sec 4-5). À l'étape 1.5.1, le
correcteur compare sa réponse à `reponse.texte` ; à l'étape 1.5.6, il coche les `attendus`.
